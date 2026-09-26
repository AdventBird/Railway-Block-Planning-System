"""TMSAdapter — Traffic Maintenance System.

TMS speaks the Engineering department's vocabulary: engineering defects on
track/bridges with ``defect_id``, ``section``, ``defect_type``, ``severity``,
``due_date``, ``duration_minutes``. Corridors are referenced by section code.
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
    parse_bool,
)
from backend.app.adapters.parsing import NOW, parse_iso, stale_message, unmapped_priority_message
from backend.app.schemas import (
    BlockWindow,
    BlockType,
    LineConfiguration,
    MaintenanceJob,
    TrainMovement,
    ValidationMessage,
)

#: TMS section codes -> canonical corridor ids (corridor catalogue lives in data/).
TMS_SECTION_TO_CORRIDOR: Dict[str, str] = {
    "NDLS-GZB": "C1",
    "TDL-CNB": "C2",
    "PRYJ-DDU": "C3",
    "GZB-ALJN": "C4",
    "DDU-BSB": "C5",
}

#: TMS defect_type -> power-isolation requirement.
TMS_ISOLATION_TYPES = {"OHE", "POWER", "CATENARY", "FEEDER"}


class TMSAdapter(SourceAdapter):
    """Normalises TMS defect records into canonical MaintenanceJobs."""

    source_system = "TMS"

    # -- job mapping ---------------------------------------------------------

    def to_jobs(self, records: List[Dict[str, Any]]) -> List[MaintenanceJob]:
        jobs: List[MaintenanceJob] = []
        for record in records:
            job = self._to_job(record)
            if job is not None:
                jobs.append(job)
        return jobs

    def _to_job(self, record: Dict[str, Any]) -> MaintenanceJob | None:
        messages: List[ValidationMessage] = []

        defect_id = str(record.get("defect_id") or "").strip()
        if not defect_id:
            raise AdapterError(f"TMS record without defect_id cannot be mapped: {record!r}")

        section = str(record.get("section") or "").strip()
        corridor_id = TMS_SECTION_TO_CORRIDOR.get(section, "")
        if not corridor_id:
            messages.append(
                ValidationMessage(
                    code="INVALID_CORRIDOR",
                    field="corridor_id",
                    severity="ERROR",
                    message=f"TMS section '{section}' is not a recognised corridor code.",
                )
            )

        duration = record.get("duration_minutes")
        if duration in (None, ""):
            messages.append(
                ValidationMessage(
                    code="MISSING_DURATION",
                    field="duration_minutes",
                    severity="ERROR",
                    message="TMS duration_minutes is missing — the job cannot be fitted into a block window.",
                )
            )
            duration = None
        else:
            try:
                duration = int(duration)
                if duration < 0:
                    raise ValueError
            except (ValueError, TypeError):
                messages.append(
                    ValidationMessage(
                        code="INVALID_TIME",
                        field="duration_minutes",
                        severity="ERROR",
                        message=f"TMS duration_minutes '{record.get('duration_minutes')}' is not a valid number of minutes.",
                    )
                )
                duration = None

        block_type = str(record.get("block_type") or "").strip().upper()
        if not block_type:
            messages.append(
                ValidationMessage(
                    code="MISSING_BLOCK_TYPE",
                    field="block_type",
                    severity="ERROR",
                    message="TMS record does not state the block type required (TRAFFIC / POWER / POWER_AND_TRAFFIC).",
                )
            )
            block_type_val = None
        else:
            try:
                block_type_val = BlockType(block_type)
            except ValueError:
                messages.append(
                    ValidationMessage(
                        code="MISSING_BLOCK_TYPE",
                        field="block_type",
                        severity="ERROR",
                        message=f"TMS block_type '{record.get('block_type')}' is outside the block taxonomy.",
                    )
                )
                block_type_val = None

        line_config = normalise_line_configuration(record.get("line_configuration"))
        working_line = normalise_working_line(record.get("working_line"), line_config)

        deadline = parse_iso(record.get("due_date"))
        if deadline is None:
            messages.append(
                ValidationMessage(
                    code="INVALID_DEADLINE",
                    field="deadline",
                    severity="WARNING",
                    message="TMS due_date is missing or unparseable — deadline pressure defaults to COMFORTABLE.",
                )
            )

        freshness = parse_iso(record.get("last_synced_at"))
        stale = stale_message(freshness, 36)
        if stale is not None:
            messages.append(stale)

        power_isolation = (
            str(record.get("defect_type") or "").strip().upper() in TMS_ISOLATION_TYPES
            or parse_bool(record.get("power_isolation_required"))
        )
        if power_isolation and block_type_val == BlockType.TRAFFIC:
            messages.append(
                ValidationMessage(
                    code="MISSING_ISOLATION_INFO",
                    field="block_type",
                    severity="WARNING",
                    message="OHE/feeder work is indicated but the block type is TRAFFIC — power isolation must be confirmed.",
                )
            )

        overdue = False
        overdue_days = 0
        if deadline is not None:
            if deadline < NOW:
                overdue = True
                overdue_days = (NOW - deadline).days

        severity_raw = record.get("severity")

        # Priority normalisation — an unmapped label becomes a structured
        # PRIORITY_UNMAPPED finding (record → REVIEW_REQUIRED), never a
        # silent downgrade to a safe-looking default.
        try:
            safety_consequence = normalise_safety_consequence(severity_raw, self.source_system)
        except PriorityUnmapped as exc:
            safety_consequence = "ROUTINE"
            messages.append(unmapped_priority_message("safety_consequence", exc))
        try:
            urgency = normalise_urgency(record.get("priority"), self.source_system)
        except PriorityUnmapped as exc:
            urgency = "NORMAL"
            messages.append(unmapped_priority_message("urgency", exc))

        try:
            job = MaintenanceJob(
                job_id=f"TMS-{defect_id}",
                source_record_id=defect_id,
                department=normalise_department(record.get("department") or "Engineering"),
                source_system=self.source_system,
                title=str(record.get("title") or record.get("defect_type") or "TMS defect"),
                asset=str(record.get("asset") or record.get("defect_type") or "Track asset"),
                location=str(record.get("location_km") or section),
                corridor_id=corridor_id or "UNKNOWN",
                section_id=str(record.get("section_id") or ""),
                severity=str(severity_raw or "MINOR").strip().upper(),
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
                adjacent_line_operational=parse_bool(record.get("adjacent_line_operational")) or line_config == LineConfiguration.SINGLE,
                status=str(record.get("status") or "OPEN").strip().upper(),
                freshness_timestamp=freshness,
            )
        except Exception as exc:  # pydantic validation failure
            raise AdapterError(f"TMS record {defect_id} failed canonical validation: {exc}") from exc

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

    # -- blocks / trains (TMS carries neither) --------------------------------

    def to_blocks(self, records: List[Dict[str, Any]]) -> List[BlockWindow]:
        return []

    def to_trains(self, records: List[Dict[str, Any]]) -> List[TrainMovement]:
        return []
