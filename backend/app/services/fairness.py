"""Department Anti-Starvation (Fairness) Service for Railway Block Planning.

Feature 7: Prevents one department from continuously consuming every maintenance
opportunity while another department's backlog grows indefinitely.
Provides controlled backlog protection by calculating configurable fairness penalties
and pressure levels for downstream optimizer consumption.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Union

from backend.app.services.priority import MaintenanceJob


# ---------------------------------------------------------------------------
# Configurable Constants
# ---------------------------------------------------------------------------
DEFAULT_DEPARTMENTS: List[str] = ["Engineering", "S&T", "TRD"]

# Pressure thresholds (number of overdue jobs)
PRESSURE_THRESHOLD_CRITICAL: int = 15
PRESSURE_THRESHOLD_HIGH: int = 10
PRESSURE_THRESHOLD_MEDIUM: int = 5
PRESSURE_THRESHOLD_LOW: int = 0

# Configurable penalty multipliers per overdue job
PENALTY_MULTIPLIER_BASE: float = 1.5
PENALTY_THRESHOLD_TRIGGER: int = 3  # Overdue count beyond which escalation penalties apply
ESCALATION_MULTIPLIER: float = 1.25


@dataclass(frozen=True)
class DepartmentFairnessStatus:
    """Structured fairness evaluation for a single department."""

    department: str
    overdue_jobs: int
    pressure: str  # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    penalty: float
    normalized_pressure: float  # [0.0, 1.0]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "department": self.department,
            "overdue_jobs": self.overdue_jobs,
            "pressure": self.pressure,
            "penalty": round(self.penalty, 2),
            "normalized_pressure": round(self.normalized_pressure, 4),
        }


class FairnessEngine:
    """Department Anti-Starvation & Backlog Protection Engine.

    Calculates fairness penalties and department pressure metrics.
    Does NOT schedule jobs directly; produces deterministic metadata for CP-SAT.
    """

    # Configurable parameters
    departments: List[str] = DEFAULT_DEPARTMENTS
    pressure_threshold_high: int = PRESSURE_THRESHOLD_HIGH
    pressure_threshold_medium: int = PRESSURE_THRESHOLD_MEDIUM
    penalty_multiplier: float = PENALTY_MULTIPLIER_BASE

    @classmethod
    def department_pressure(cls, department: str, overdue_count: int) -> str:
        """Determine qualitative pressure level based on overdue backlog count.

        Returns:
            "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
        """
        count = max(0, int(overdue_count))
        if count >= PRESSURE_THRESHOLD_CRITICAL:
            return "CRITICAL"
        if count >= cls.pressure_threshold_high:
            return "HIGH"
        if count >= cls.pressure_threshold_medium:
            return "MEDIUM"
        return "LOW"

    @classmethod
    def calculate_penalty(
        cls,
        department: str,
        overdue_count: int,
        multiplier: Optional[float] = None,
    ) -> float:
        """Calculate the fairness penalty score for a department.

        Higher overdue backlogs produce higher penalty scores, escalating when
        crossing critical thresholds to ensure the solver prioritizes starving departments.

        Formula:
            overdue_count * multiplier (with escalation for high pressure)
        """
        count = max(0, int(overdue_count))
        if count == 0:
            return 0.0

        eff_multiplier = multiplier if multiplier is not None else cls.penalty_multiplier

        # Base linear penalty
        base_penalty = count * eff_multiplier

        # Escalation if exceeding high pressure threshold
        if count >= cls.pressure_threshold_high:
            excess = count - cls.pressure_threshold_high
            base_penalty += excess * (eff_multiplier * (ESCALATION_MULTIPLIER - 1.0))

        return round(base_penalty, 2)

    @classmethod
    def normalize_backlog(cls, backlog_counts: Dict[str, int]) -> Dict[str, float]:
        """Normalize backlog counts across departments to a [0.0, 1.0] scale.

        If all backlogs are zero, returns 0.0 for all departments.
        """
        if not backlog_counts:
            return {}

        max_backlog = max(backlog_counts.values()) if backlog_counts else 0
        if max_backlog <= 0:
            return {dept: 0.0 for dept in backlog_counts}

        return {
            dept: round(max(0, count) / max_backlog, 4)
            for dept, count in backlog_counts.items()
        }

    @classmethod
    def is_job_overdue(cls, job: Union[MaintenanceJob, Dict[str, Any]]) -> bool:
        """Check deterministically whether a job is classified as overdue."""
        if isinstance(job, dict):
            overdue_age = job.get("overdue_age") or job.get("overdue_days")
            deadline = str(job.get("deadline") or job.get("due") or "").lower()
            tier_reason = str(job.get("tierReason") or job.get("tier_reason") or "").lower()
        else:
            overdue_age = getattr(job, "overdue_age", None) or getattr(job, "overdue_days", None)
            deadline = str(getattr(job, "deadline", "") or "").lower()
            tier_reason = str(getattr(job, "tier_reason", "") or "").lower()

        if overdue_age is not None:
            try:
                if float(overdue_age) > 0:
                    return True
            except (ValueError, TypeError):
                pass

        if "overdue" in deadline or "overdue" in tier_reason:
            return True

        return False

    @classmethod
    def extract_department(cls, job: Union[MaintenanceJob, Dict[str, Any]]) -> str:
        """Extract standardized department name from a job."""
        if isinstance(job, dict):
            raw_dept = str(job.get("department") or job.get("dept") or "Other").strip()
        else:
            raw_dept = str(getattr(job, "department", "") or getattr(job, "dept", "") or "Other").strip()

        # Match known departments case-insensitively
        for standard_dept in cls.departments:
            if raw_dept.lower() == standard_dept.lower():
                return standard_dept

        return raw_dept if raw_dept else "Other"

    @classmethod
    def backlog_summary(
        cls,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        supported_departments: Optional[List[str]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Generate a complete department backlog summary and fairness evaluation.

        Aggregates overdue jobs per department and computes pressure and penalty.

        Args:
            jobs: Sequence of MaintenanceJob objects or job dictionaries.
            supported_departments: Optional list of departments to include.
                                   Defaults to DEFAULT_DEPARTMENTS.

        Returns:
            Dictionary mapping department name to {overdue_jobs, pressure, penalty}.
        """
        depts = supported_departments or cls.departments
        overdue_counts: Dict[str, int] = {d: 0 for d in depts}

        # Count overdue jobs per department
        for job in jobs:
            dept = cls.extract_department(job)
            if dept not in overdue_counts:
                overdue_counts[dept] = 0

            if cls.is_job_overdue(job):
                overdue_counts[dept] += 1

        normalized = cls.normalize_backlog(overdue_counts)

        summary: Dict[str, Dict[str, Any]] = {}
        for dept, count in overdue_counts.items():
            pressure = cls.department_pressure(dept, count)
            penalty = cls.calculate_penalty(dept, count)
            summary[dept] = {
                "overdue_jobs": count,
                "pressure": pressure,
                "penalty": int(round(penalty)) if penalty.is_integer() else penalty,
                "normalized_pressure": normalized.get(dept, 0.0),
            }

        return summary

    @classmethod
    def explain(cls, department: str, overdue_jobs: int) -> str:
        """Generate a human-readable explanation for a department's fairness state."""
        pressure = cls.department_pressure(department, overdue_jobs)
        penalty = cls.calculate_penalty(department, overdue_jobs)

        lines = [
            f"Department Anti-Starvation Report: {department}",
            f"Overdue Backlog: {overdue_jobs} jobs",
            f"Pressure Level: {pressure}",
            f"Fairness Penalty: {penalty}",
        ]

        if pressure in ("HIGH", "CRITICAL"):
            lines.append("Protection Action: Backlog threshold exceeded; prioritization boost active to prevent starvation.")
        elif pressure == "MEDIUM":
            lines.append("Protection Action: Moderate backlog; normal scheduling priority maintained.")
        else:
            lines.append("Protection Action: Backlog healthy; no starvation protection penalty required.")

        return "\n".join(lines)
