"""Feature 10 — line configuration feasibility.

A double-line section is NOT automatically safe: feasibility depends on the
working line, the state of the adjacent line, and the job's operational
impact. A single-line section always impacts both directions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from backend.app.schemas import LineConfiguration, MaintenanceJob, Section, ValidationMessage


@dataclass
class LineFeasibility:
    """Outcome of checking one job against a section's line configuration."""

    feasible: bool
    working_line: Optional[str] = None
    adjacent_line: Optional[str] = None
    adjacent_movement_may_continue: Optional[bool] = None
    both_directions_impacted: bool = False
    reasons: List[ValidationMessage] = field(default_factory=list)

    @property
    def summary(self) -> str:
        if self.feasible:
            return "Line configuration supports this job as stated."
        return "; ".join(m.message for m in self.reasons) or "Line configuration does not support this job."


class LineConfigEngine:
    """Deterministic single/double-line feasibility decisions."""

    def check(self, job: MaintenanceJob, section: Optional[Section] = None) -> LineFeasibility:
        """Decide whether the job's line-configuration assumptions hold.

        When a canonical ``section`` is supplied, the job's declared layout is
        also cross-checked against the physical section register.
        """
        reasons: List[ValidationMessage] = []
        line_config = LineConfiguration(job.line_configuration)

        if section is not None and section.line_configuration != line_config:
            reasons.append(ValidationMessage(
                code="LINE_CONFIG_MISMATCH",
                field="line_configuration",
                severity="ERROR",
                message=(
                    f"Job declares a {line_config.value} layout but section "
                    f"{section.section_id} is {section.line_configuration} in the "
                    "network register — resolve before planning."
                ),
            ))

        if line_config == LineConfiguration.SINGLE:
            return self._check_single(job, reasons, infeasible=bool(reasons))
        return self._check_double(job, section, reasons)

    # ---------------------------------------------------------------- single

    def _check_single(
        self, job: MaintenanceJob, reasons: List[ValidationMessage], infeasible: bool = False
    ) -> LineFeasibility:
        """Single line: both directions share the one track, so any possession
        that stops movements impacts UP and DOWN traffic alike."""
        both_directions = True
        adjacent_may_continue = False  # no adjacent line exists

        # A single-line possession that blocks the track stops both directions.
        if job.block_type in ("TRAFFIC", "POWER_AND_TRAFFIC") and job.duration_minutes:
            # Informational — not an error, but it must be visible to the planner.
            reasons.append(ValidationMessage(
                code="SINGLE_LINE_BOTH_DIRECTIONS",
                field="line_configuration",
                severity="INFO",
                message=(
                    "Single-line section: a possession stops movements in BOTH directions "
                    "(UP and DOWN share the same track) — plan relief working accordingly."
                ),
            ))

        return LineFeasibility(
            feasible=not infeasible,
            working_line="SINGLE",
            adjacent_line=None,
            adjacent_movement_may_continue=adjacent_may_continue,
            both_directions_impacted=both_directions,
            reasons=reasons,
        )

    # ---------------------------------------------------------------- double

    def _check_double(
        self, job: MaintenanceJob, section: Optional[Section], reasons: List[ValidationMessage]
    ) -> LineFeasibility:
        adjacent_line = "DOWN" if job.working_line == "UP" else "UP" if job.working_line == "DOWN" else None

        # The working line must be stated explicitly.
        if job.working_line not in ("UP", "DOWN"):
            reasons.append(ValidationMessage(
                code="WORKING_LINE_REQUIRED",
                field="working_line",
                severity="ERROR",
                message=(
                    "Double-line section: the working line (UP or DOWN) must be stated — "
                    "possession cannot be assumed to be safe."
                ),
            ))
            return LineFeasibility(
                feasible=False,
                working_line=job.working_line,
                adjacent_line=adjacent_line,
                adjacent_movement_may_continue=None,
                both_directions_impacted=False,
                reasons=reasons,
            )

        adjacent_may_continue = bool(job.adjacent_line_operational)

        # Claiming the adjacent line continues while the job itself declares a
        # corridor/network-level impact is a contradiction — flag it.
        if adjacent_may_continue and job.operational_impact in ("NETWORK", "CORRIDOR"):
            reasons.append(ValidationMessage(
                code="ADJACENT_LINE_RISK",
                field="adjacent_line_operational",
                severity="WARNING",
                message=(
                    f"Job declares {job.operational_impact} operational impact but claims the "
                    f"adjacent {adjacent_line} line keeps carrying traffic — heavy plant or "
                    "oversail may still violate the adjacent line's safe envelope; confirm "
                    "before relying on adjacent movement."
                ),
            ))
            adjacent_may_continue = False

        # Jobs needing OHE isolation de-energise BOTH lines on electrified
        # double-line sections unless the section is fed in parts.
        if job.power_isolation_required and adjacent_may_continue:
            reasons.append(ValidationMessage(
                code="ADJACENT_LINE_POWER_RISK",
                field="adjacent_line_operational",
                severity="WARNING",
                message=(
                    f"Power isolation for this job likely de-energises the adjacent "
                    f"{adjacent_line} line as well unless the feed is sectioned — "
                    "adjacent movement cannot be assumed to continue."
                ),
            ))
            adjacent_may_continue = False

        # Section-level cross-check: is the working line actually part of this section?
        if section is not None and section.lines and job.working_line not in [str(l) for l in section.lines]:
            reasons.append(ValidationMessage(
                code="WORKING_LINE_NOT_IN_SECTION",
                field="working_line",
                severity="ERROR",
                message=(
                    f"Working line {job.working_line} is not one of the physical lines on "
                    f"section {section.section_id} ({', '.join(str(l) for l in section.lines)})."
                ),
            ))

        return LineFeasibility(
            feasible=not any(m.severity == "ERROR" for m in reasons),
            working_line=job.working_line,
            adjacent_line=adjacent_line,
            adjacent_movement_may_continue=adjacent_may_continue,
            both_directions_impacted=False,
            reasons=reasons,
        )
