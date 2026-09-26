"""Feature 21 — backend reason-code engine (SINGLE canonical registry).

Machine-generated scheduling reason codes with officer-readable
explanations. The LLM layer may WORD these explanations, but the codes and
their meaning originate here — the LLM must NEVER invent scheduling reason
codes or their structure.

Every subsystem (optimizer, diagnostics, scenarios, API, frontend) imports
reason codes from this module. ``backend.app.services.reason_codes`` is a
thin backward-compatibility re-export, not a second registry.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence

from backend.app.schemas import MaintenanceJob


class ReasonCode(str, Enum):
    """Canonical machine-generated scheduling reason codes."""

    INSUFFICIENT_WINDOW = "INSUFFICIENT_WINDOW"
    TRAIN_CONFLICT = "TRAIN_CONFLICT"
    RESOURCE_CONFLICT = "RESOURCE_CONFLICT"
    RESOURCE_UNAVAILABLE = "RESOURCE_UNAVAILABLE"
    ISOLATION_CONFLICT = "ISOLATION_CONFLICT"
    INCOMPATIBLE_WORK = "INCOMPATIBLE_WORK"
    LOWER_PRIORITY = "LOWER_PRIORITY"
    NO_FEASIBLE_WINDOW = "NO_FEASIBLE_WINDOW"
    PROTECTED_MOVEMENT_CONFLICT = "PROTECTED_MOVEMENT_CONFLICT"
    BLOCK_CAPACITY = "BLOCK_CAPACITY"
    SECTION_RESTRICTION = "SECTION_RESTRICTION"
    BLOCK_TYPE_MISMATCH = "BLOCK_TYPE_MISMATCH"
    LOCKED_ASSIGNMENT = "LOCKED_ASSIGNMENT"
    LOCKED_ASSIGNMENT_CONFLICT = "LOCKED_ASSIGNMENT_CONFLICT"
    PRIORITY_UNMAPPED = "PRIORITY_UNMAPPED"
    DATA_STALE = "DATA_STALE"
    INVALID_DATA = "INVALID_DATA"


#: Officer-readable explanation template per code. These are the ONLY
#: authoritative wordings — the LLM may not introduce new codes or meanings.
REASON_DESCRIPTIONS: Dict[ReasonCode, str] = {
    ReasonCode.INSUFFICIENT_WINDOW: (
        "No proposed or sanctioned window in the horizon is long enough for the "
        "job's setup + work + restore phases."
    ),
    ReasonCode.TRAIN_CONFLICT: (
        "Scheduled movements occupy every feasible gap in the required period."
    ),
    ReasonCode.RESOURCE_CONFLICT: (
        "A required resource is booked on overlapping work — it cannot execute "
        "two jobs at the same time."
    ),
    ReasonCode.RESOURCE_UNAVAILABLE: (
        "A required resource is unavailable — committed elsewhere, in POH, or "
        "not rostered before the deadline."
    ),
    ReasonCode.ISOLATION_CONFLICT: (
        "The required power isolation cannot be granted — the feed is already "
        "isolated or the isolation budget for the night is exhausted."
    ),
    ReasonCode.INCOMPATIBLE_WORK: (
        "Another job holds the same stretch with mutually unsafe work methods."
    ),
    ReasonCode.LOWER_PRIORITY: (
        "Higher-tier work claims the scarce window capacity; this job holds "
        "safely to a later date."
    ),
    ReasonCode.NO_FEASIBLE_WINDOW: (
        "No window satisfies the job's block type, line configuration and "
        "isolation combination."
    ),
    ReasonCode.PROTECTED_MOVEMENT_CONFLICT: (
        "A protected movement occupies the required period and must not be "
        "regulated."
    ),
    ReasonCode.BLOCK_CAPACITY: (
        "The block window is already committed to other jobs up to its "
        "capacity."
    ),
    ReasonCode.SECTION_RESTRICTION: (
        "The section carries a caution order, speed restriction or approval "
        "hold that excludes new possessions."
    ),
    ReasonCode.BLOCK_TYPE_MISMATCH: (
        "The job's required block kind does not match the block type granted "
        "in the window (e.g. POWER work under a TRAFFIC-only block)."
    ),
    ReasonCode.LOCKED_ASSIGNMENT: (
        "The job is locked to a specific window by prior sanction."
    ),
    ReasonCode.LOCKED_ASSIGNMENT_CONFLICT: (
        "A locked assignment has become impossible after an event — the lock "
        "is reported, never silently moved."
    ),
    ReasonCode.PRIORITY_UNMAPPED: (
        "The source priority/severity label could not be mapped to the "
        "canonical priority model — the record requires review before planning."
    ),
    ReasonCode.DATA_STALE: (
        "The record is older than the freshness horizon — confirm it is still "
        "open before planning."
    ),
    ReasonCode.INVALID_DATA: (
        "The record failed canonical validation and cannot take part in "
        "planning."
    ),
}


#: Deterministic accumulation order for diagnostics (declaration order of
#: :class:`ReasonCode`, not alphabetical) — pinned by tests.
CODE_ORDER: List[ReasonCode] = [
    ReasonCode.PROTECTED_MOVEMENT_CONFLICT,
    ReasonCode.INSUFFICIENT_WINDOW,
    ReasonCode.BLOCK_CAPACITY,
    ReasonCode.RESOURCE_UNAVAILABLE,
    ReasonCode.RESOURCE_CONFLICT,
    ReasonCode.ISOLATION_CONFLICT,
    ReasonCode.INCOMPATIBLE_WORK,
    ReasonCode.NO_FEASIBLE_WINDOW,
    ReasonCode.SECTION_RESTRICTION,
    ReasonCode.BLOCK_TYPE_MISMATCH,
    ReasonCode.TRAIN_CONFLICT,
    ReasonCode.LOCKED_ASSIGNMENT,
    ReasonCode.LOCKED_ASSIGNMENT_CONFLICT,
    ReasonCode.LOWER_PRIORITY,
    ReasonCode.PRIORITY_UNMAPPED,
    ReasonCode.DATA_STALE,
    ReasonCode.INVALID_DATA,
]


def sort_codes(codes: Sequence[ReasonCode]) -> List[ReasonCode]:
    """Order reason codes deterministically (diagnostics accumulation order)."""
    present = set(codes)
    return [c for c in CODE_ORDER if c in present]


@dataclass
class UnscheduledResult:
    """Structured deferral record for one job."""

    job_id: str
    scheduled: bool = False
    reason_codes: List[ReasonCode] = field(default_factory=list)
    explanation: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "scheduled": self.scheduled,
            "reason_codes": [c.value if isinstance(c, ReasonCode) else c for c in self.reason_codes],
            "explanation": list(self.explanation),
        }


class ReasonCodeEngine:
    """Derives deterministic reason codes from operational inputs."""

    def __init__(self, rules_path=None) -> None:
        self._rules_path = rules_path

    @property
    def _overheads(self) -> Dict[str, int]:
        from backend.app.rules.compatibility import load_compatibility_rules

        return load_compatibility_rules(self._rules_path).get("overheads", {})

    # ------------------------------------------------------------- primitives

    def insufficient_window(
        self, job: MaintenanceJob, window_minutes: Optional[int]
    ) -> Optional[ReasonCode]:
        """The job's full possession does not fit the candidate window."""
        if window_minutes is None:
            return None
        required = (
            (job.duration_minutes or 0)
            + job.setup_duration_minutes
            + job.restore_duration_minutes
        )
        if required > window_minutes:
            return ReasonCode.INSUFFICIENT_WINDOW
        return None

    def protected_movement(
        self,
        job: MaintenanceJob,
        window_start: int,
        window_end: int,
        movements: Sequence[Dict[str, Any]],
    ) -> Optional[ReasonCode]:
        """A protected train movement occupies the whole usable period.

        ``window_start``/``window_end`` are continuous-timeline minutes
        (cross-midnight safe). Only movements on the job's corridor count.
        """
        from backend.app.services.timeline import (
            interval_gaps,
            minutes_from_hhmm,
            overlaps,
        )

        corridor = job.corridor_id
        for mv in movements:
            if str(mv.get("corridorId") or mv.get("corridor_id") or "") != corridor:
                continue
            if not mv.get("isProtected", mv.get("protected", True)):
                continue
            t_start = minutes_from_hhmm(mv.get("start") or mv.get("entry"))
            t_end = t_start + minutes_from_hhmm(mv.get("duration") or 0) \
                if mv.get("duration") is not None else minutes_from_hhmm(mv.get("end") or mv.get("exit"))
            if t_end is None or t_start is None:
                continue
            if not overlaps(window_start, window_end, t_start, t_end):
                continue
            # Is there any protected-duration-sized gap left in the window?
            required = (
                (job.duration_minutes or 0)
                + job.setup_duration_minutes
                + job.restore_duration_minutes
            )
            gaps = interval_gaps(window_start, window_end, [(t_start, t_end)])
            if not any(gap_end - gap_start >= required for gap_start, gap_end in gaps):
                return ReasonCode.PROTECTED_MOVEMENT_CONFLICT
        return None

    # --------------------------------------------------------------- evaluate

    def evaluate(
        self,
        job: MaintenanceJob,
        window_minutes: Optional[int] = None,
        unavailable_resources: Optional[Sequence[str]] = None,
        isolation_available: bool = True,
        protected_overlap: bool = False,
        gap_minutes: int = 0,
        incompatible_with: Optional[Sequence[str]] = None,
        feasible_block_types: Optional[Sequence[str]] = None,
        windows_in_corridor: Optional[int] = None,
        remaining_block_minutes: Optional[int] = None,
        section_status: str = "clear",
    ) -> UnscheduledResult:
        """Accumulate every applicable deferral reason for one job.

        Deterministic: the same inputs always yield the same codes in the
        same order (declaration order of :class:`ReasonCode`).
        """
        codes: set[ReasonCode] = set()
        explanation: List[str] = []
        required = (
            (job.duration_minutes or 0)
            + job.setup_duration_minutes
            + job.restore_duration_minutes
        )

        if window_minutes is not None and self.insufficient_window(job, window_minutes):
            codes.add(ReasonCode.INSUFFICIENT_WINDOW)
            explanation.append(
                f"Possession demand {required} min (setup + work + restore) exceeds "
                f"the {window_minutes} min window."
            )

        for resource in unavailable_resources or []:
            codes.add(ReasonCode.RESOURCE_CONFLICT)
            explanation.append(f"Required resource '{resource}' is unavailable.")

        if not isolation_available:
            codes.add(ReasonCode.ISOLATION_CONFLICT)
            explanation.append("Power isolation cannot be granted for this possession.")

        if protected_overlap and required > gap_minutes:
            codes.add(ReasonCode.PROTECTED_MOVEMENT_CONFLICT)
            explanation.append(
                f"A protected movement leaves only {gap_minutes} min of safe gap; "
                f"the possession needs {required} min."
            )

        for other in incompatible_with or []:
            codes.add(ReasonCode.INCOMPATIBLE_WORK)
            explanation.append(f"Work methods are mutually unsafe with job {other}.")

        if feasible_block_types is not None and not feasible_block_types:
            codes.add(ReasonCode.NO_FEASIBLE_WINDOW)
            explanation.append(
                "No block type in the taxonomy satisfies the job's isolation and "
                "access requirements."
            )
        elif feasible_block_types is None and windows_in_corridor is not None and windows_in_corridor == 0:
            codes.add(ReasonCode.NO_FEASIBLE_WINDOW)
            explanation.append("No candidate window exists on the job's corridor.")

        if remaining_block_minutes is not None and required > remaining_block_minutes:
            codes.add(ReasonCode.BLOCK_CAPACITY)
            explanation.append(
                f"Only {remaining_block_minutes} min of uncommitted block capacity remain."
            )

        if section_status in ("caution", "blocked", "maintenance"):
            codes.add(ReasonCode.SECTION_RESTRICTION)
            explanation.append(
                f"Section status '{section_status}' excludes new possessions."
            )

        ordered = sort_codes(codes)
        return UnscheduledResult(
            job_id=job.job_id,
            scheduled=False,
            reason_codes=ordered,
            explanation=explanation,
        )


def reason_code_catalogue() -> List[Dict[str, str]]:
    """The authoritative catalogue served by GET /api/reason-codes."""
    return [
        {"code": code.value, "description": description}
        for code, description in REASON_DESCRIPTIONS.items()
    ]
