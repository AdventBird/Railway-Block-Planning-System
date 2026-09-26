"""Canonical planning-world bridge — ONE path from the canonical domain.

The canonical domain model lives in ``backend.app.schemas`` (Pydantic) and is
produced by ingestion. The optimizer/planner stack consumes a compact
``services.priority.MaintenanceJobProjection`` projection (a *view*, not a
second domain: it carries no persistence, no data-quality machinery and is
always built FROM the canonical job through :func:`job_to_optimizer`).

Every planner-facing entry point (planner.run_plan, replanning, scenarios,
evaluation) funnels through this module, so there is exactly one conversion
and one canonical source of truth.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence

from backend.app.schemas import (
    BlockWindow,
    DataQualityStatus,
    MaintenanceJob,
    Resource,
    Section,
    TrainMovement,
)
from backend.app.services.timeline import interval_minutes, minutes_from_hhmm

#: Jobs whose data quality blocks planning entirely.
_PLANNABLE_STATUSES = {DataQualityStatus.READY.value}

#: Block windows that are not available for new planning.
_UNAVAILABLE_BLOCK_STATUSES = {"rejected"}


class CanonicalBridge:
    """Projects the canonical world into optimizer-facing payloads."""

    def __init__(
        self,
        jobs: Sequence[MaintenanceJob],
        blocks: Sequence[BlockWindow],
        trains: Sequence[TrainMovement],
        resources: Sequence[Resource],
        sections: Sequence[Section],
        include_review_required: bool = True,
    ) -> None:
        self._include_review = include_review_required
        self.jobs = [j for j in jobs if self._plannable(j)]
        self.blocks = [b for b in blocks if b.status not in _UNAVAILABLE_BLOCK_STATUSES]
        self.trains = list(trains)
        self.resources = list(resources)
        self.sections = list(sections)

    # ----------------------------------------------------------------- jobs

    def _plannable(self, job: MaintenanceJob) -> bool:
        status = job.data_quality_status.value if isinstance(job.data_quality_status, DataQualityStatus) else str(job.data_quality_status)
        if status == DataQualityStatus.READY.value:
            return True
        return bool(self._include_review) and status == DataQualityStatus.REVIEW_REQUIRED.value

    @staticmethod
    def job_to_optimizer(job: MaintenanceJob) -> Dict[str, Any]:
        """Canonical job → compact optimizer payload (one conversion)."""
        phases = job.work_phases or []
        has_setup = "SETUP" in phases or not phases
        has_restore = "RESTORE" in phases or not phases
        return {
            "id": job.job_id,
            "title": job.title,
            "department": job.department,
            "source": job.source_system,
            "corridor_id": job.corridor_id,
            "section_id": job.section_id,
            "asset": job.asset,
            "duration_minutes": job.duration_minutes or 0,
            "setup_duration_minutes": job.setup_duration_minutes if has_setup else 0,
            "restore_duration_minutes": job.restore_duration_minutes if has_restore else 0,
            "deadline": job.deadline.isoformat() if job.deadline else None,
            "tier": job.tier,
            "tier_reason": job.tier_reason,
            "resources": list(job.required_resources),
            "needs_power_isolation": bool(job.power_isolation_required),
            "block_type": job.block_type,
            "line_configuration": job.line_configuration,
            "working_line": job.working_line,
            "adjacent_line_operational": bool(job.adjacent_line_operational),
            "severity": job.severity,
            "safety_consequence": job.safety_consequence,
            "asset_criticality": job.asset_criticality,
            "urgency": job.urgency,
            "deadline_pressure": job.deadline_pressure,
            "operational_impact": job.operational_impact,
            "overdue": job.overdue,
            "overdue_days": job.overdue_days,
            "status": job.status,
            "data_quality_status": job.data_quality_status.value
            if isinstance(job.data_quality_status, DataQualityStatus)
            else str(job.data_quality_status),
        }

    def optimizer_jobs(self) -> List[Dict[str, Any]]:
        """Canonical jobs → optimizer payloads.

        Note: conversion happens through the canonical Pydantic models held on
        ``self.jobs``; ``MaintenanceJobProjection`` (priority layer) is the
        compact view the optimizer/priority stack projects them into.
        """
        return [self.job_to_optimizer(j) for j in self.jobs]

    # --------------------------------------------------------------- blocks

    @staticmethod
    def block_to_optimizer(block: BlockWindow) -> Dict[str, Any]:
        """Canonical block window → optimizer window payload.

        Windows are placed on the continuous overnight timeline
        (cross-midnight safe) and carry their start/end in both minute and
        HH:MM form. ``allows_power_isolation`` is derived from block type.
        """
        interval = interval_minutes(
            block.start.strftime("%H:%M") if block.start else None,
            block.end.strftime("%H:%M") if block.end else None,
        )
        allows_power = block.block_type in ("POWER", "POWER_AND_TRAFFIC")
        payload: Dict[str, Any] = {
            "id": block.window_id,
            "blockId": block.block_id,
            "corridorId": block.corridor_id,
            "blockType": block.block_type,
            "status": block.status,
            "minutes": block.duration_minutes or 0,
            "allowsPowerIsolation": allows_power,
            "note": block.note,
        }
        if block.start is not None and block.end is not None and interval is not None:
            payload["start"] = block.start.strftime("%H:%M")
            payload["end"] = block.end.strftime("%H:%M")
            payload["start_minutes"] = interval[0]
            payload["end_minutes"] = interval[1]
            payload["minutes"] = max(payload["minutes"], interval[1] - interval[0])
        return payload

    def optimizer_windows(self) -> List[Dict[str, Any]]:
        return [self.block_to_optimizer(b) for b in self.blocks]

    # --------------------------------------------------------------- trains

    @staticmethod
    def train_to_optimizer(train: TrainMovement) -> Dict[str, Any]:
        """Canonical train movement → optimizer movement payload."""
        entry = train.entry_time.strftime("%H:%M") if train.entry_time else None
        exit_ = train.exit_time.strftime("%H:%M") if train.exit_time else None
        interval = interval_minutes(entry, exit_)
        return {
            "id": train.train_id,
            "number": train.train_number,
            "name": train.train_number,
            "type": train.train_type,
            "corridorId": train.corridor_id,
            "isProtected": bool(train.protected),
            "protected": bool(train.protected),
            "start": entry,
            "end": exit_,
            "start_minutes": interval[0] if interval else None,
            "end_minutes": interval[1] if interval else None,
            "note": train.note,
        }

    def optimizer_trains(self) -> List[Dict[str, Any]]:
        return [self.train_to_optimizer(t) for t in self.trains]

    # ------------------------------------------------------------ resources

    def optimizer_resource_availability(self) -> Dict[str, List[Dict[str, Any]]]:
        """resource name → unavailability windows (optimizer-facing).

        A resource marked UNAVAILABLE carries its downtime as
        ``available_from``/``available_until``; anything outside those bounds
        counts as unavailable.
        """
        out: Dict[str, List[Dict[str, Any]]] = {}
        for resource in self.resources:
            note = (resource.availability_note or "").upper()
            if "UNAVAILABLE" in note or "POH" in note:
                out[resource.name] = [
                    {
                        "from": resource.available_from.isoformat() if resource.available_from else None,
                        "until": resource.available_until.isoformat() if resource.available_until else None,
                    }
                ]
        return out

    # -------------------------------------------------------------- indexes

    def section_of(self, corridor_id: str, working_line: str = "") -> Optional[Section]:
        for section in self.sections:
            if section.corridor_id != corridor_id:
                continue
            if not working_line or working_line == "SINGLE":
                return section
            if working_line in (section.lines or []) or "BOTH" in (section.lines or []):
                return section
        return None
