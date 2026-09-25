"""Uncertainty Buffer Service for Railway Block Planning.

Feature 15: Protects maintenance windows from overrunning into protected train movements.
Uses deterministic synthetic buffers (no statistical P50/P90 assumptions).

Formula:
    protected_duration = estimated_duration + uncertainty_buffer + safety_buffer
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Union

from backend.app.services.priority import MaintenanceJob


# ---------------------------------------------------------------------------
# Configurable Default Buffers (in minutes)
# ---------------------------------------------------------------------------
# Default uncertainty buffer if not explicitly set on the job
DEFAULT_UNCERTAINTY_MINUTES: int = 15

# Default safety margin before protected train movement / block boundary
DEFAULT_SAFETY_BUFFER_MINUTES: int = 15

# Minimum non-negative bound
MIN_DURATION_MINUTES: int = 0


@dataclass(frozen=True)
class ProtectedDurationResult:
    """Structured result of a protected duration evaluation."""

    job_id: str
    estimated: int
    uncertainty: int
    safety: int
    protected_duration: int
    fits: bool
    remaining_safe_time: int

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation matching the API specification."""
        return {
            "job_id": self.job_id,
            "estimated": self.estimated,
            "uncertainty": self.uncertainty,
            "safety": self.safety,
            "protected_duration": self.protected_duration,
            "fits": self.fits,
        }


class BufferEngine:
    """Deterministic Uncertainty & Safety Buffer Engine.

    Calculates protected job durations and verifies feasibility against available
    traffic gaps before protected train movements.
    """

    default_uncertainty: int = DEFAULT_UNCERTAINTY_MINUTES
    default_safety: int = DEFAULT_SAFETY_BUFFER_MINUTES

    @classmethod
    def protected_duration(
        cls,
        estimated_duration: Union[int, float, MaintenanceJob, Dict[str, Any]],
        uncertainty_buffer: Optional[Union[int, float]] = None,
        safety_buffer: Optional[Union[int, float]] = None,
    ) -> int:
        """Calculate the total protected duration for a job or duration tuple.

        Formula:
            protected_duration = estimated_duration + uncertainty_buffer + safety_buffer

        Can be called directly with numbers:
            BufferEngine.protected_duration(90, 20, 15) -> 125
        Or with a MaintenanceJob or dictionary object:
            BufferEngine.protected_duration(job)
        """
        # If job object or dict was passed as the first argument
        if isinstance(estimated_duration, (MaintenanceJob, dict)):
            job = estimated_duration
            est = cls._extract_field(job, "estimated_duration", "duration_minutes", "minutes", default=0)
            unc = cls._extract_field(job, "uncertainty_buffer", "uncertaintyBuffer", default=cls.default_uncertainty)
            safe = cls._extract_field(job, "safety_buffer", "safetyBuffer", default=cls.default_safety)

            est_val = max(MIN_DURATION_MINUTES, int(est or 0))
            unc_val = max(0, int(unc if uncertainty_buffer is None else uncertainty_buffer))
            safe_val = max(0, int(safe if safety_buffer is None else safety_buffer))
            return est_val + unc_val + safe_val

        # Direct numeric inputs
        est_val = max(MIN_DURATION_MINUTES, int(estimated_duration or 0))
        unc_val = max(0, int(uncertainty_buffer if uncertainty_buffer is not None else cls.default_uncertainty))
        safe_val = max(0, int(safety_buffer if safety_buffer is not None else cls.default_safety))

        return est_val + unc_val + safe_val

    @classmethod
    def remaining_safe_time(
        cls,
        available_minutes: Union[int, float],
        protected_minutes: Union[int, float],
    ) -> int:
        """Calculate remaining clearance time after protected maintenance duration.

        Returns:
            available_minutes - protected_minutes (negative if overrun occurs).
        """
        avail = int(available_minutes or 0)
        prot = int(protected_minutes or 0)
        return avail - prot

    @classmethod
    def fits_before_protected_movement(
        cls,
        available_minutes: Union[int, float],
        protected_minutes: Union[int, float],
    ) -> bool:
        """Check if the protected job duration fits within the available traffic gap.

        Returns:
            True if protected_duration <= available_minutes, False otherwise.
        """
        avail = int(available_minutes or 0)
        prot = int(protected_minutes or 0)
        return prot <= avail

    @classmethod
    def evaluate_job(
        cls,
        job: Union[MaintenanceJob, Dict[str, Any]],
        available_minutes: Optional[Union[int, float]] = None,
        uncertainty_buffer: Optional[int] = None,
        safety_buffer: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Evaluate a job's complete protected duration and fit within an available window.

        Returns:
            Dictionary matching the required specification:
            {
              "job_id": "J-05",
              "estimated": 90,
              "uncertainty": 20,
              "safety": 15,
              "protected_duration": 125,
              "fits": true
            }
        """
        job_id = str(cls._extract_field(job, "id", "job_id", "jobId", default="UNKNOWN"))
        raw_est = cls._extract_field(job, "estimated_duration", "duration_minutes", "minutes", default=0)
        raw_unc = cls._extract_field(job, "uncertainty_buffer", "uncertaintyBuffer", default=cls.default_uncertainty)
        raw_safe = cls._extract_field(job, "safety_buffer", "safetyBuffer", default=cls.default_safety)

        est = max(MIN_DURATION_MINUTES, int(raw_est or 0))
        unc = max(0, int(uncertainty_buffer if uncertainty_buffer is not None else raw_unc))
        safe = max(0, int(safety_buffer if safety_buffer is not None else raw_safe))

        protected = est + unc + safe

        fits = True
        remaining = 0
        if available_minutes is not None:
            fits = cls.fits_before_protected_movement(available_minutes, protected)
            remaining = cls.remaining_safe_time(available_minutes, protected)

        result = ProtectedDurationResult(
            job_id=job_id,
            estimated=est,
            uncertainty=unc,
            safety=safe,
            protected_duration=protected,
            fits=fits,
            remaining_safe_time=remaining,
        )
        return result.to_dict()

    @classmethod
    def explain(
        cls,
        job_or_id: Union[str, MaintenanceJob, Dict[str, Any]],
        available_minutes: Optional[int] = None,
        estimated: Optional[int] = None,
        uncertainty: Optional[int] = None,
        safety: Optional[int] = None,
    ) -> str:
        """Generate a human-readable explanation of the buffer calculation."""
        if isinstance(job_or_id, (MaintenanceJob, dict)):
            evaluation = cls.evaluate_job(
                job_or_id,
                available_minutes=available_minutes,
                uncertainty_buffer=uncertainty,
                safety_buffer=safety,
            )
            job_id = evaluation["job_id"]
            est = evaluation["estimated"]
            unc = evaluation["uncertainty"]
            safe = evaluation["safety"]
            prot = evaluation["protected_duration"]
            fits = evaluation["fits"]
        else:
            job_id = str(job_or_id)
            est = max(0, int(estimated or 0))
            unc = max(0, int(uncertainty if uncertainty is not None else cls.default_uncertainty))
            safe = max(0, int(safety if safety is not None else cls.default_safety))
            prot = est + unc + safe
            fits = True if available_minutes is None else (prot <= available_minutes)

        lines = [
            f"Buffer Protection Analysis for Job {job_id}:",
            f"- Estimated Duration: {est} min",
            f"- Uncertainty Buffer: +{unc} min (deterministic variance buffer)",
            f"- Safety Margin: +{safe} min (clearance before protected movement)",
            f"- Total Protected Duration: {prot} min",
        ]

        if available_minutes is not None:
            rem = available_minutes - prot
            status_text = "FITS" if fits else "OVERRUN RISK"
            lines.append(f"- Available Window: {available_minutes} min [{status_text}]")
            lines.append(f"- Clearance Buffer: {rem} min remaining")
            if not fits:
                lines.append("! WARNING: Job cannot be safely scheduled in this window without violating train paths.")

        return "\n".join(lines)

    @classmethod
    def _extract_field(
        cls, job: Union[MaintenanceJob, Dict[str, Any]], *field_names: str, default: Any = None
    ) -> Any:
        """Extract a field value from a job object or dictionary."""
        for name in field_names:
            if isinstance(job, dict):
                if name in job and job[name] is not None:
                    return job[name]
            elif hasattr(job, name):
                val = getattr(job, name)
                if val is not None:
                    return val
        return default
