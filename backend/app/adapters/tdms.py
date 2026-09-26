"""TDMSAdapter — Traction Distribution Maintenance System (TRD / OHE).

TDMS vocabulary: ``asset_ref``, ``isolation_required``, ``urgency``,
``duration`` (minutes), ``corridor``. Every TDMS job implies a power block.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List

from backend.app.adapters.base import AdapterError, SourceAdapter
from backend.app.adapters.mapping import (
    PriorityUnmapped,
    normalise_asset_criticality,
    normalise_department,
    normalise_line_configuration,
    normalise_operational_impact,
    normalise_safety_consequence,
    normalise_urgency,
    normalise_working_line,
)
from backend.app.adapters.parsing import NOW, parse_iso, stale_message, unmapped_priority_message
from backend.app.schemas import (
    BlockWindow,
    BlockType,
    MaintenanceJob,
    TrainMovement,
    ValidationMessage,
)

#: TDMS corridor codes -> canonical corridor ids.
TDMS_CORRIDOR_MAP: Dict[str, str] = {
    "NDLS-GZB": "C1",
    "TDL-CNB": "C2",
    "PRYJ-DDU": "C3",
    "GZB-ALJN": "C4",
    "DDU-BSB": "C5",
}


class TDMSAdapter(SourceAdapter):
    """Normalises TDMS OHE/traction records into canonical MaintenanceJobs."""

    source_system = "TDMS"

    def to_jobs(self, records: List[Dict[str, Any]]) -> List[MaintenanceJob]:
        jobs: List[MaintenanceJob] = []
        for record in records:
            job = self._to_job(record)
            if job is not None:
                jobs.append(job)
        return jobs

    def _to_job(self, record: Dict[str, Any]) -> MaintenanceJob | None:
        messages: List[ValidationMessage] = []

        asset_ref = str(record.get("asset_ref") or "").strip()
        if not asset_ref:
            raise AdapterError(f"TDMS record without asset_ref cannot be mapped: {record!r}")

        corridor_code = str(record.get("corridor") or "").strip()
        corridor_id = TDMS_CORRIDOR_MAP.get(corridor_code, "")
        if not corridor_id:
            messages.append(
                ValidationMessage(
                    code="INVALID_CORRIDOR",
                    field="corridor_id",
                    severity="ERROR",
                    message=f"TDMS corridor '{corridor_code}' is not a recognised corridor code.",
                )
            )

        duration_raw = record.get("duration")
        duration: int | None
        if duration_raw in (None, ""):
            messages.append(
                ValidationMessage(
                    code="MISSING_DURATION",
                    field="duration_minutes",
                    severity="ERROR",
                    message="TDMS duration is missing — the job cannot be fitted into a block window.",
                )
            )
            duration = None
        else:
            try:
                duration = int(duration_raw)
                if duration < 0:
                    raise ValueError
            except (ValueError, TypeError):
                messages.append(
                    ValidationMessage(
                        code="INVALID_TIME",
                        field="duration_minutes",
                        severity="ERROR",
                        message=f"TDMS duration '{duration_raw}' is not a valid number of minutes.",
                    )
                )
                duration = None

        isolation_raw = str(record.get("isolation_required") or "").strip().lower()
        if not isolation_raw:
            messages.append(
                ValidationMessage(
                    code="MISSING_ISOLATION_INFO",
                    field="power_isolation_required",
                    severity="ERROR",
                    message="TDMS isolation_required is empty — a TRD job without a stated isolation is unsafe to plan.",
                )
            )
            power_isolation = True  # TRD work implies power isolation by policy
            block_type_val: BlockType | None = None
        elif isolation_raw in ("y", "yes", "true", "1", "required"):
            power_isolation = True
            block_type_val = BlockType.POWER
        elif isolation_raw in ("n", "no", "false", "0"):
            # TRD declaring no isolation is suspicious — flag for review but keep POWER.
            power_isolation = True
            block_type_val = BlockType.POWER
            messages.append(
                ValidationMessage(
                    code="MISSING_ISOLATION_INFO",
                    field="power_isolation_required",
                    severity="WARNING",
                    message="TDMS declares no isolation for traction work — OHE isolation is mandatory; confirm with the TRD dispatcher.",
                )
            )
        else:
            messages.append(
                ValidationMessage(
                    code="MISSING_ISOLATION_INFO",
                    field="power_isolation_required",
                    severity="WARNING",
                    message=f"TDMS isolation_required '{record.get('isolation_required')}' is not a recognised flag.",
                )
            )
            power_isolation = True
            block_type_val = BlockType.POWER

        line_config = normalise_line_configuration(record.get("line_configuration"))
        working_line = normalise_working_line(record.get("working_line"), line_config)

        deadline = parse_iso(record.get("due_by"))
        if deadline is None:
            messages.append(
                ValidationMessage(
                    code="INVALID_DEADLINE",
                    field="deadline",
                    severity="WARNING",
                    message="TDMS due_by is missing or unparseable — deadline pressure defaults to COMFORTABLE.",
                )
            )

        freshness = parse_iso(record.get("last_synced_at"))
        stale = stale_message(freshness, 36)
        if stale is not None:
            messages.append(stale)

        overdue = deadline is not None and deadline < NOW
        overdue_days = max(0, (NOW - deadline).days) if overdue else 0

        # Priority normalisation — unmapped labels become structured
        # PRIORITY_UNMAPPED findings, never silent downgrades.
        try:
            safety_consequence = normalise_safety_consequence(
                record.get("consequence"), self.source_system
            )
        except PriorityUnmapped as exc:
            safety_consequence = "ROUTINE"
            messages.append(unmapped_priority_message("safety_consequence", exc))
        try:
            urgency = normalise_urgency(record.get("urgency"), self.source_system)
        except PriorityUnmapped as exc:
            urgency = "NORMAL"
            messages.append(unmapped_priority_message("urgency", exc))

        try:
            job = MaintenanceJob(
                job_id=f"TDMS-{asset_ref}",
                source_record_id=asset_ref,
                department=normalise_department(record.get("department") or "TRD"),
                source_system=self.source_system,
                title=str(record.get("title") or "Traction maintenance"),
                asset=str(record.get("asset_desc") or asset_ref),
                location=str(record.get("location_km") or corridor_code),
                corridor_id=corridor_id or "UNKNOWN",
                section_id=str(record.get("section_id") or ""),
                severity=str(record.get("urgency") or "ROUTINE").strip().upper(),
                safety_consequence=safety_consequence,
                asset_criticality=normalise_asset_criticality(
                    record.get("asset_class"), self.source_system
                ),
                urgency=urgency,
                deadline_pressure=self._deadline_pressure(overdue, deadline),
                operational_impact=normalise_operational_impact(
                    record.get("scope"), self.source_system
                ),
                overdue=overdue,
                overdue_days=overdue_days,
                deadline=deadline,
                duration_minutes=duration,
                setup_duration_minutes=int(record.get("setup_minutes") or 0),
                restore_duration_minutes=int(record.get("restore_minutes") or 0),
                block_type=block_type_val,
                required_resources=[str(r) for r in (record.get("resources") or [])],
                power_isolation_required=power_isolation,
                line_configuration=line_config,
                working_line=working_line,
                adjacent_line_operational=True,
                status=str(record.get("status") or "OPEN").strip().upper(),
                freshness_timestamp=freshness,
            )
        except Exception as exc:
            raise AdapterError(f"TDMS asset {asset_ref} failed canonical validation: {exc}") from exc

        return self._finalize_quality(job, messages)

    @staticmethod
    def _deadline_pressure(overdue: bool, deadline: datetime | None) -> str:
        if overdue:
            return "OVERDUE"
        if deadline is None:
            return "COMFORTABLE"
        delta = deadline - NOW
        if delta <= timedelta(hours=24):
            return "IMMEDIATE"
        if delta <= timedelta(days=7):
            return "SHORT"
        return "COMFORTABLE"

    def to_blocks(self, records: List[Dict[str, Any]]) -> List[BlockWindow]:
        return []

    def to_trains(self, records: List[Dict[str, Any]]) -> List[TrainMovement]:
        return []
