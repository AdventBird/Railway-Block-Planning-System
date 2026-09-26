"""COAAdapter — Controller of Allocation (block register) + BDMS bridge data.

COA vocabulary: ``block_id``, ``corridor``, ``start``, ``end``, ``block_type``,
``status``. BDMS (Bridge & Detail Maintenance System) rides the same adapter:
bridge inspection records become canonical jobs with ``asset_ref``-style ids.
"""

from __future__ import annotations

from datetime import timedelta
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
)
from backend.app.adapters.parsing import NOW, parse_hhmm, parse_iso, stale_message, unmapped_priority_message
from backend.app.schemas import (
    BlockWindow,
    BlockType,
    MaintenanceJob,
    TrainMovement,
    ValidationMessage,
)

#: COA corridor codes -> canonical corridor ids.
COA_CORRIDOR_MAP: Dict[str, str] = {
    "NDLS-GZB": "C1",
    "TDL-CNB": "C2",
    "PRYJ-DDU": "C3",
    "GZB-ALJN": "C4",
    "DDU-BSB": "C5",
    "CNB-LKO": "C6",
}

#: COA block_type free text -> canonical taxonomy.
COA_BLOCK_TYPE_MAP: Dict[str, BlockType] = {
    "TRAFFIC": BlockType.TRAFFIC,
    "POWER": BlockType.POWER,
    "POWER_AND_TRAFFIC": BlockType.POWER_AND_TRAFFIC,
    "P&T": BlockType.POWER_AND_TRAFFIC,
    "P T": BlockType.POWER_AND_TRAFFIC,
    "OHE": BlockType.POWER,
}

#: COA status free text -> canonical lifecycle.
COA_STATUS_MAP: Dict[str, str] = {
    "proposed": "proposed",
    "requested": "proposed",
    "pending": "pending",
    "sanctioned": "approved",
    "approved": "approved",
    "granted": "approved",
    "rejected": "rejected",
    "locked": "locked",
}


#: Longest plausible single possession: Sunday mega-blocks run ~6 h; anything
#: beyond half an operational night+ is treated as a data error.
MAX_BLOCK_MINUTES = 12 * 60


class COAAdapter(SourceAdapter):
    """Normalises COA block records and BDMS bridge records."""

    source_system = "BDMS"

    # ------------------------------------------------------------------ blocks

    def to_blocks(self, records: List[Dict[str, Any]]) -> List[BlockWindow]:
        windows: List[BlockWindow] = []
        for record in records:
            window = self._to_block(record)
            if window is not None:
                windows.append(window)
        return windows

    def _to_block(self, record: Dict[str, Any]) -> BlockWindow | None:
        messages: List[ValidationMessage] = []

        block_id = str(record.get("block_id") or "").strip()
        if not block_id:
            raise AdapterError(f"COA record without block_id cannot be mapped: {record!r}")

        corridor_code = str(record.get("corridor") or "").strip()
        corridor_id = COA_CORRIDOR_MAP.get(corridor_code, "")
        if not corridor_id:
            messages.append(
                ValidationMessage(
                    code="INVALID_CORRIDOR",
                    field="corridor_id",
                    severity="ERROR",
                    message=f"COA corridor '{corridor_code}' is not a recognised corridor code.",
                )
            )

        start = parse_hhmm(record.get("start"))
        end = parse_hhmm(record.get("end"))
        if start is None:
            messages.append(
                ValidationMessage(
                    code="INVALID_TIME",
                    field="start",
                    severity="ERROR",
                    message=f"COA block start '{record.get('start')}' is not a valid HH:MM time.",
                )
            )
        if end is None:
            messages.append(
                ValidationMessage(
                    code="INVALID_TIME",
                    field="end",
                    severity="ERROR",
                    message=f"COA block end '{record.get('end')}' is not a valid HH:MM time.",
                )
            )

        duration = 0
        if start and end:
            duration = int((end - start).total_seconds() // 60)
            if duration < 0:
                # HH:MM times carry no date: a negative span normally means the
                # block crosses midnight (end on the next operational day).
                # Only tolerate short crossings — maintenance possessions never
                # exceed one operational night (~12 h), so a 22:00-21:00 span
                # (23 h "block") is a data error, not a midnight wrap.
                duration += 24 * 60
                end = end + timedelta(days=1)
                if duration > MAX_BLOCK_MINUTES:
                    messages.append(
                        ValidationMessage(
                            code="INVALID_TIME",
                            field="end",
                            severity="ERROR",
                            message=(
                                f"COA block end '{record.get('end')}' would make the possession "
                                f"{duration} min long — beyond one operational night; treat as a data error."
                            ),
                        )
                    )
            elif duration == 0:
                messages.append(
                    ValidationMessage(
                        code="INVALID_TIME",
                        field="end",
                        severity="ERROR",
                        message="COA block end is not after its start.",
                    )
                )

        raw_type = str(record.get("block_type") or "").strip().upper()
        block_type = COA_BLOCK_TYPE_MAP.get(raw_type)
        if block_type is None:
            messages.append(
                ValidationMessage(
                    code="MISSING_BLOCK_TYPE",
                    field="block_type",
                    severity="ERROR",
                    message=f"COA block_type '{record.get('block_type')}' is outside the block taxonomy.",
                )
            )
            block_type = BlockType.TRAFFIC

        status = COA_STATUS_MAP.get(str(record.get("status") or "").strip().lower(), "proposed")

        freshness = parse_iso(record.get("last_synced_at"))
        stale = stale_message(freshness, 36)
        if stale is not None:
            messages.append(stale)

        try:
            window = BlockWindow(
                window_id=block_id,
                block_id=block_id,
                corridor_id=corridor_id or "UNKNOWN",
                block_type=block_type,
                status=status,  # type: ignore[arg-type]
                start=start,
                end=end,
                duration_minutes=duration,
                note=str(record.get("work") or record.get("note") or ""),
                data_quality_status="READY",
                data_quality_messages=[],
            )
        except Exception as exc:
            raise AdapterError(f"COA block {block_id} failed canonical validation: {exc}") from exc

        return self._finalize_quality(window, messages)

    # --------------------------------------------------------------------- jobs

    def to_jobs(self, records: List[Dict[str, Any]]) -> List[MaintenanceJob]:
        """BDMS bridge/structure records -> canonical jobs."""
        jobs: List[MaintenanceJob] = []
        for record in records:
            job = self._to_job(record)
            if job is not None:
                jobs.append(job)
        return jobs

    def _to_job(self, record: Dict[str, Any]) -> MaintenanceJob | None:
        messages: List[ValidationMessage] = []

        bridge_ref = str(record.get("bridge_ref") or record.get("asset_ref") or "").strip()
        if not bridge_ref:
            raise AdapterError(f"BDMS record without bridge_ref cannot be mapped: {record!r}")

        corridor_code = str(record.get("corridor") or "").strip()
        corridor_id = COA_CORRIDOR_MAP.get(corridor_code, "")
        if not corridor_id:
            messages.append(
                ValidationMessage(
                    code="INVALID_CORRIDOR",
                    field="corridor_id",
                    severity="ERROR",
                    message=f"BDMS corridor '{corridor_code}' is not a recognised corridor code.",
                )
            )

        duration_raw = record.get("work_time")
        duration: int | None
        if duration_raw in (None, ""):
            messages.append(
                ValidationMessage(
                    code="MISSING_DURATION",
                    field="duration_minutes",
                    severity="ERROR",
                    message="BDMS work_time is missing — the job cannot be fitted into a block window.",
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
                        message=f"BDMS work_time '{duration_raw}' is not a valid number of minutes.",
                    )
                )
                duration = None

        block_type_raw = str(record.get("block_type") or "").strip().upper()
        block_type = COA_BLOCK_TYPE_MAP.get(block_type_raw)
        if block_type is None:
            messages.append(
                ValidationMessage(
                    code="MISSING_BLOCK_TYPE",
                    field="block_type",
                    severity="ERROR",
                    message=f"BDMS block_type '{record.get('block_type')}' is outside the block taxonomy.",
                )
            )
            block_type = None

        line_config = normalise_line_configuration(record.get("line_configuration"))
        working_line_raw = str(record.get("working_line") or "").strip().upper()
        if line_config == "SINGLE":
            working_line = "SINGLE"
        elif working_line_raw in ("UP", "DOWN"):
            working_line = working_line_raw
        else:
            working_line = "SINGLE"

        deadline = parse_iso(record.get("due_date"))
        if deadline is None:
            messages.append(
                ValidationMessage(
                    code="INVALID_DEADLINE",
                    field="deadline",
                    severity="WARNING",
                    message="BDMS due_date is missing or unparseable — deadline pressure defaults to COMFORTABLE.",
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
                record.get("condition"), "BDMS"
            )
        except PriorityUnmapped as exc:
            safety_consequence = "ROUTINE"
            messages.append(unmapped_priority_message("safety_consequence", exc))
        try:
            urgency = normalise_urgency(record.get("urgency"), "BDMS")
        except PriorityUnmapped as exc:
            urgency = "NORMAL"
            messages.append(unmapped_priority_message("urgency", exc))

        try:
            job = MaintenanceJob(
                job_id=f"BDMS-{bridge_ref}",
                source_record_id=bridge_ref,
                department=normalise_department(record.get("department") or "Engineering"),
                source_system="BDMS",
                title=str(record.get("title") or "Bridge inspection"),
                asset=str(record.get("asset_desc") or bridge_ref),
                location=str(record.get("location_km") or corridor_code),
                corridor_id=corridor_id or "UNKNOWN",
                section_id=str(record.get("section_id") or ""),
                severity=str(record.get("condition") or "MINOR").strip().upper(),
                safety_consequence=safety_consequence,
                asset_criticality=normalise_asset_criticality(
                    record.get("asset_class"), "BDMS"
                ),
                urgency=urgency,
                deadline_pressure=self._deadline_pressure(overdue, deadline),
                operational_impact=normalise_operational_impact(
                    record.get("scope"), "BDMS"
                ),
                overdue=overdue,
                overdue_days=overdue_days,
                deadline=deadline,
                duration_minutes=duration,
                setup_duration_minutes=int(record.get("setup_minutes") or 0),
                restore_duration_minutes=int(record.get("restore_minutes") or 0),
                block_type=block_type,
                required_resources=[str(r) for r in (record.get("resources") or [])],
                power_isolation_required=block_type in ("POWER", "POWER_AND_TRAFFIC"),
                line_configuration=line_config,
                working_line=working_line,
                adjacent_line_operational=True,
                status=str(record.get("status") or "OPEN").strip().upper(),
                freshness_timestamp=freshness,
            )
        except Exception as exc:
            raise AdapterError(f"BDMS record {bridge_ref} failed canonical validation: {exc}") from exc

        return self._finalize_quality(job, messages)

    @staticmethod
    def _deadline_pressure(overdue: bool, deadline) -> str:
        from datetime import timedelta

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

    def to_trains(self, records: List[Dict[str, Any]]) -> List[TrainMovement]:
        return []
