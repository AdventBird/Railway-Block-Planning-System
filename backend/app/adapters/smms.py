"""SMMSAdapter — Signalling & Telecom Maintenance Management System.

SMMS vocabulary differs deliberately from TMS: ``incident_no``, ``location``,
``condition``, ``priority_label`` (P1..P4), ``work_time`` (minutes).
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

#: SMMS location codes -> canonical corridor ids.
SMMS_LOCATION_TO_CORRIDOR: Dict[str, str] = {
    "NDLS-GZB": "C1",
    "TDL-CNB": "C2",
    "PRYJ-DDU": "C3",
    "GZB-ALJN": "C4",
    "DDU-BSB": "C5",
    "CNB-LKO": "C6",
}


class SMMSAdapter(SourceAdapter):
    """Normalises SMMS incident records into canonical MaintenanceJobs."""

    source_system = "SMMS"

    def to_jobs(self, records: List[Dict[str, Any]]) -> List[MaintenanceJob]:
        jobs: List[MaintenanceJob] = []
        for record in records:
            job = self._to_job(record)
            if job is not None:
                jobs.append(job)
        return jobs

    def _to_job(self, record: Dict[str, Any]) -> MaintenanceJob | None:
        messages: List[ValidationMessage] = []

        incident_no = str(record.get("incident_no") or "").strip()
        if not incident_no:
            raise AdapterError(f"SMMS record without incident_no cannot be mapped: {record!r}")

        location = str(record.get("location") or "").strip()
        corridor_id = SMMS_LOCATION_TO_CORRIDOR.get(location, "")
        if not corridor_id:
            messages.append(
                ValidationMessage(
                    code="INVALID_CORRIDOR",
                    field="corridor_id",
                    severity="ERROR",
                    message=f"SMMS location '{location}' is not a recognised corridor code.",
                )
            )

        work_time = record.get("work_time")
        duration: int | None
        if work_time in (None, ""):
            messages.append(
                ValidationMessage(
                    code="MISSING_DURATION",
                    field="duration_minutes",
                    severity="ERROR",
                    message="SMMS work_time is missing — the job cannot be fitted into a block window.",
                )
            )
            duration = None
        else:
            try:
                duration = int(work_time)
                if duration < 0:
                    raise ValueError
            except (ValueError, TypeError):
                messages.append(
                    ValidationMessage(
                        code="INVALID_TIME",
                        field="duration_minutes",
                        severity="ERROR",
                        message=f"SMMS work_time '{work_time}' is not a valid number of minutes.",
                    )
                )
                duration = None

        # SMMS expresses block needs through two fields: block_requested and
        # power_block_required. The combination picks the canonical block type.
        block_requested = str(record.get("block_requested") or "").strip().upper()
        power_block = str(record.get("power_block_required") or "").strip().lower() in (
            "1",
            "y",
            "yes",
            "true",
        )
        if block_requested and power_block:
            block_type_val = BlockType.POWER_AND_TRAFFIC
        elif block_requested:
            block_type_val = BlockType.TRAFFIC
        elif power_block:
            block_type_val = BlockType.POWER
        else:
            messages.append(
                ValidationMessage(
                    code="MISSING_BLOCK_TYPE",
                    field="block_type",
                    severity="ERROR",
                    message="SMMS incident states neither block_requested nor power_block_required.",
                )
            )
            block_type_val = None

        line_config = normalise_line_configuration(record.get("line_configuration"))
        working_line = normalise_working_line(record.get("working_line"), line_config)

        deadline = parse_iso(record.get("target_date"))
        if deadline is None:
            messages.append(
                ValidationMessage(
                    code="INVALID_DEADLINE",
                    field="deadline",
                    severity="WARNING",
                    message="SMMS target_date is missing or unparseable — deadline pressure defaults to COMFORTABLE.",
                )
            )

        freshness = parse_iso(record.get("last_synced_at"))
        stale = stale_message(freshness, 36)
        if stale is not None:
            messages.append(stale)

        overdue = deadline is not None and deadline < NOW
        overdue_days = max(0, (NOW - deadline).days) if overdue else 0

        priority_label = record.get("priority_label")

        # Priority normalisation — unmapped labels become structured
        # PRIORITY_UNMAPPED findings, never silent downgrades.
        try:
            safety_consequence = normalise_safety_consequence(
                record.get("condition"), self.source_system
            )
        except PriorityUnmapped as exc:
            safety_consequence = "ROUTINE"
            messages.append(unmapped_priority_message("safety_consequence", exc))
        try:
            urgency = normalise_urgency(priority_label, self.source_system)
        except PriorityUnmapped as exc:
            urgency = "NORMAL"
            messages.append(unmapped_priority_message("urgency", exc))

        try:
            job = MaintenanceJob(
                job_id=f"SMMS-{incident_no}",
                source_record_id=incident_no,
                department=normalise_department(record.get("department") or "S&T"),
                source_system=self.source_system,
                title=str(record.get("title") or record.get("condition") or "S&T incident"),
                asset=str(record.get("asset") or record.get("condition") or "S&T asset"),
                location=str(record.get("station") or location),
                corridor_id=corridor_id or "UNKNOWN",
                section_id=str(record.get("section_id") or ""),
                severity=str(record.get("condition") or "MINOR").strip().upper(),
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
                power_isolation_required=power_block,
                line_configuration=line_config,
                working_line=working_line,
                adjacent_line_operational=True,
                status=str(record.get("status") or "OPEN").strip().upper(),
                freshness_timestamp=freshness,
            )
        except Exception as exc:
            raise AdapterError(f"SMMS incident {incident_no} failed canonical validation: {exc}") from exc

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
