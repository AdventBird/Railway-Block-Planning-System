"""Feature 3 — deterministic data-quality validation before planning.

Every canonical record is checked against the same rule set regardless of
source system, producing READY / REVIEW_REQUIRED / STALE / INVALID plus
detailed, officer-readable messages.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from backend.app import config
from backend.app.schemas import (
    BlockWindow,
    DataQualityStatus,
    MaintenanceJob,
    TrainMovement,
    ValidationMessage,
)

#: Operational timezone (IST) — matches the seeded planning night.
IST = timezone(timedelta(hours=5, minutes=30))

#: Freshness horizon: records older than this are STALE (configurable via
#: RBPS_STALENESS_HOURS; kept as a module constant for backward imports).
STALENESS_HOURS = config.STALENESS_HOURS

#: A job must be fittable into some plausible window.
MIN_PLANNABLE_MINUTES = 0

#: Corridors/sections considered valid (seeded from network reference data).
VALID_CORRIDORS: List[str] = ["C1", "C2", "C3", "C4", "C5", "C6"]


@dataclass
class DataQualityReport:
    """Aggregated validation outcome for a set of canonical records."""

    jobs: Dict[str, DataQualityStatus] = field(default_factory=dict)
    messages: Dict[str, List[ValidationMessage]] = field(default_factory=dict)
    counts: Dict[str, int] = field(default_factory=lambda: {
        "ready": 0,
        "review_required": 0,
        "stale": 0,
        "invalid": 0,
    })

    def record(self, entity_id: str, status: DataQualityStatus, messages: List[ValidationMessage]) -> None:
        self.jobs[entity_id] = status
        self.messages[entity_id] = messages
        self.counts[status.value.lower()] += 1

    @property
    def blocking(self) -> List[str]:
        """Entity ids that cannot take part in planning."""
        return [eid for eid, s in self.jobs.items() if s in (DataQualityStatus.INVALID, DataQualityStatus.STALE)]

    def to_dict(self) -> Dict[str, object]:
        return {
            "counts": dict(self.counts),
            "jobs": {eid: s.value for eid, s in self.jobs.items()},
            "messages": {
                eid: [m.model_dump(mode="json") for m in msgs]
                for eid, msgs in self.messages.items()
            },
        }


class DataQualityEngine:
    """Runs the full deterministic validation pass over canonical records."""

    def __init__(self, now: Optional[datetime] = None, staleness_hours: Optional[int] = None) -> None:
        self._now = now or config.simulation_now()
        self._staleness = timedelta(hours=staleness_hours if staleness_hours is not None else config.STALENESS_HOURS)

    # ------------------------------------------------------------------ jobs

    def validate_job(self, job: MaintenanceJob) -> tuple[DataQualityStatus, List[ValidationMessage]]:
        """Apply the deterministic rule set to one canonical job."""
        messages: List[ValidationMessage] = list(job.data_quality_messages)

        def has(code: str) -> bool:
            return any(m.code == code for m in messages)

        # 1. missing duration -------------------------------------------------
        if job.duration_minutes is None:
            if not has("MISSING_DURATION"):
                messages.append(ValidationMessage(
                    code="MISSING_DURATION",
                    field="duration_minutes",
                    severity="ERROR",
                    message="Duration is missing — the job cannot be fitted into a block window.",
                ))
        elif job.duration_minutes <= MIN_PLANNABLE_MINUTES:
            if not has("INVALID_TIME"):
                messages.append(ValidationMessage(
                    code="INVALID_TIME",
                    field="duration_minutes",
                    severity="ERROR",
                    message=f"Duration {job.duration_minutes} min is not a positive, plannable amount of work.",
                ))

        # 2. missing block type ------------------------------------------------
        if job.block_type is None:
            if not has("MISSING_BLOCK_TYPE"):
                messages.append(ValidationMessage(
                    code="MISSING_BLOCK_TYPE",
                    field="block_type",
                    severity="ERROR",
                    message="Block type is missing — the possession kind (TRAFFIC/POWER/POWER_AND_TRAFFIC) must be stated.",
                ))

        # 3. invalid corridor ----------------------------------------------------
        if job.corridor_id in ("", "UNKNOWN") or job.corridor_id not in VALID_CORRIDORS:
            if not has("INVALID_CORRIDOR"):
                messages.append(ValidationMessage(
                    code="INVALID_CORRIDOR",
                    field="corridor_id",
                    severity="ERROR",
                    message=f"Corridor '{job.corridor_id}' is not in the network corridor register.",
                ))

        # 4. invalid resources ---------------------------------------------------
        for resource in job.required_resources:
            if _looks_like_unknown_resource(resource):
                if not has("INVALID_RESOURCE"):
                    messages.append(ValidationMessage(
                        code="INVALID_RESOURCE",
                        field="required_resources",
                        severity="WARNING",
                        message=f"Required resource '{resource}' is not in the resource register.",
                    ))

        # 5. stale record ---------------------------------------------------------
        if job.freshness_timestamp is None:
            if not has("MISSING_FRESHNESS"):
                messages.append(ValidationMessage(
                    code="MISSING_FRESHNESS",
                    field="freshness_timestamp",
                    severity="WARNING",
                    message="No freshness timestamp — record age cannot be verified.",
                ))
        else:
            age = self._now - job.freshness_timestamp
            if age > self._staleness:
                if not has("STALE_RECORD"):
                    messages.append(ValidationMessage(
                        code="STALE_RECORD",
                        field="freshness_timestamp",
                        severity="WARNING",
                        message=f"Record is {age.days} d {age.seconds // 3600} h old (limit {STALENESS_HOURS} h) — confirm it is still open before planning.",
                    ))

        # 6. invalid deadline ---------------------------------------------------------
        if job.deadline is None:
            if not has("INVALID_DEADLINE"):
                messages.append(ValidationMessage(
                    code="INVALID_DEADLINE",
                    field="deadline",
                    severity="WARNING",
                    message="Deadline is missing or unparseable — deadline pressure cannot be derived.",
                ))
        elif job.deadline < datetime(2020, 1, 1, tzinfo=IST):
            if not has("INVALID_DEADLINE"):
                messages.append(ValidationMessage(
                    code="INVALID_DEADLINE",
                    field="deadline",
                    severity="WARNING",
                    message=f"Deadline {job.deadline.isoformat()} is implausibly far in the past.",
                ))

        # 7. missing isolation information ---------------------------------------------
        if job.power_isolation_required and job.block_type not in ("POWER", "POWER_AND_TRAFFIC"):
            if not has("MISSING_ISOLATION_INFO"):
                messages.append(ValidationMessage(
                    code="MISSING_ISOLATION_INFO",
                    field="block_type",
                    severity="ERROR",
                    message="Power isolation is required but the block type is not POWER or POWER_AND_TRAFFIC.",
                ))
        if job.source_system == "TDMS" and not job.power_isolation_required:
            if not has("MISSING_ISOLATION_INFO"):
                messages.append(ValidationMessage(
                    code="MISSING_ISOLATION_INFO",
                    field="power_isolation_required",
                    severity="WARNING",
                    message="TDMS record without an explicit isolation flag — TRD work always requires OHE isolation confirmation.",
                ))

        # 8. invalid time (setup/restore sanity) ----------------------------------------
        for fname, fval in (("setup_duration_minutes", job.setup_duration_minutes),
                            ("restore_duration_minutes", job.restore_duration_minutes)):
            if fval is not None and fval < 0:
                if not has("INVALID_TIME"):
                    messages.append(ValidationMessage(
                        code="INVALID_TIME",
                        field=fname,
                        severity="ERROR",
                        message=f"{fname} must not be negative.",
                    ))

        # 9. double-line semantics -------------------------------------------------------
        if job.line_configuration == "DOUBLE":
            if job.working_line == "SINGLE":
                if not has("INVALID_LINE_CONFIG"):
                    messages.append(ValidationMessage(
                        code="INVALID_LINE_CONFIG",
                        field="working_line",
                        severity="WARNING",
                        message="Double-line section requires an explicit working line (UP or DOWN).",
                    ))
        elif job.line_configuration == "SINGLE":
            if not job.adjacent_line_operational:
                if not has("INVALID_LINE_CONFIG"):
                    messages.append(ValidationMessage(
                        code="INVALID_LINE_CONFIG",
                        field="adjacent_line_operational",
                        severity="WARNING",
                        message="Single-line section has no adjacent line; adjacent_line_operational should be true.",
                    ))

        # ---- final status ------------------------------------------------------------
        has_error = any(m.severity == "ERROR" for m in messages)
        stale = any(m.code == "STALE_RECORD" or m.code == "MISSING_FRESHNESS" for m in messages)
        if has_error:
            return DataQualityStatus.INVALID, messages
        if stale:
            return DataQualityStatus.STALE, messages
        if any(m.severity == "WARNING" for m in messages):
            return DataQualityStatus.REVIEW_REQUIRED, messages
        return DataQualityStatus.READY, messages

    # ------------------------------------------------------------------ other records

    def validate_block(self, block: BlockWindow) -> tuple[DataQualityStatus, List[ValidationMessage]]:
        messages: List[ValidationMessage] = list(block.data_quality_messages)

        if block.corridor_id in ("", "UNKNOWN") or block.corridor_id not in VALID_CORRIDORS:
            messages.append(ValidationMessage(
                code="INVALID_CORRIDOR",
                field="corridor_id",
                severity="ERROR",
                message=f"Block corridor '{block.corridor_id}' is not in the network corridor register.",
            ))
        if block.duration_minutes <= 0:
            messages.append(ValidationMessage(
                code="INVALID_TIME",
                field="duration_minutes",
                severity="ERROR",
                message="Block duration must be positive.",
            ))

        if any(m.severity == "ERROR" for m in messages):
            status = DataQualityStatus.INVALID
        elif any(m.severity == "WARNING" for m in messages):
            status = DataQualityStatus.REVIEW_REQUIRED
        else:
            status = DataQualityStatus.READY
        return status, messages

    def validate_train(self, train: TrainMovement) -> tuple[DataQualityStatus, List[ValidationMessage]]:
        messages: List[ValidationMessage] = list(train.data_quality_messages)

        if train.corridor_id in ("", "UNKNOWN") or train.corridor_id not in VALID_CORRIDORS:
            messages.append(ValidationMessage(
                code="INVALID_CORRIDOR",
                field="corridor_id",
                severity="ERROR",
                message=f"Train corridor '{train.corridor_id}' is not in the network corridor register.",
            ))
        if train.entry_time is None or train.exit_time is None:
            messages.append(ValidationMessage(
                code="INVALID_TIME",
                field="entry_time" if train.entry_time is None else "exit_time",
                severity="ERROR",
                message="Train path needs both an entry and an exit time.",
            ))

        if any(m.severity == "ERROR" for m in messages):
            status = DataQualityStatus.INVALID
        elif any(m.severity == "WARNING" for m in messages):
            status = DataQualityStatus.REVIEW_REQUIRED
        else:
            status = DataQualityStatus.READY
        return status, messages

    def validate_all(
        self,
        jobs: List[MaintenanceJob],
        blocks: Optional[List[BlockWindow]] = None,
        trains: Optional[List[TrainMovement]] = None,
    ) -> DataQualityReport:
        """Validate every canonical record and aggregate the report."""
        report = DataQualityReport()
        for job in jobs:
            status, messages = self.validate_job(job)
            job.data_quality_status = status
            job.data_quality_messages = messages
            report.record(job.job_id, status, messages)
        for block in blocks or []:
            status, messages = self.validate_block(block)
            block.data_quality_status = status
            block.data_quality_messages = messages
            report.record(f"block:{block.window_id}", status, messages)
        for train in trains or []:
            status, messages = self.validate_train(train)
            train.data_quality_status = status
            train.data_quality_messages = messages
            report.record(f"train:{train.train_id}", status, messages)
        return report


def _looks_like_unknown_resource(name: str) -> bool:
    """Heuristic: resources not present in the register raise a review flag."""
    lowered = name.strip().lower()
    return lowered.startswith("unknown") or lowered in {"", "-", "tbd", "n/a"}
