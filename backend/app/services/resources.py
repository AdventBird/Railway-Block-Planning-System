"""Resource Availability Service for Railway Block Planning.

Feature 16: Prevents overlapping assignments for shared railway resources (gangs,
machines, tower wagons, inspection crews, welding sets, tampers).
Provides feasibility checking, conflict detection, deterministic reservation tracking,
and release operations.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple, Union


# ---------------------------------------------------------------------------
# Canonical Conflict Reason Codes
# ---------------------------------------------------------------------------
REASON_RESOURCE_CONFLICT: str = "RESOURCE_CONFLICT"
REASON_RESOURCE_AVAILABLE: str = "RESOURCE_AVAILABLE"
REASON_INVALID_TIME_WINDOW: str = "INVALID_TIME_WINDOW"


@dataclass(frozen=True)
class ResourceReservation:
    """A deterministic reservation of a resource for a specific job and time window."""

    job_id: str
    resource: str
    start_minutes: int
    end_minutes: int
    start_time_str: str = ""
    end_time_str: str = ""


@dataclass(frozen=True)
class ResourceConflict:
    """Structured report for a detected resource conflict."""

    resource: str
    available: bool
    conflict_with: Optional[str] = None
    reason: str = REASON_RESOURCE_CONFLICT
    start_time: str = ""
    end_time: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary matching required specification."""
        out: Dict[str, Any] = {
            "resource": self.resource,
            "available": self.available,
            "conflict_with": self.conflict_with,
            "reason": self.reason,
        }
        return out


def parse_time_to_minutes(time_val: Union[str, int, float]) -> int:
    """Convert a time value ('HH:MM' string or integer minutes) to integer minutes from 00:00.

    Examples:
        "01:30" -> 90
        "05:00" -> 300
        90 -> 90
    """
    if isinstance(time_val, (int, float)):
        return max(0, int(time_val))

    time_str = str(time_val).strip()
    match = re.search(r"(\d{1,2}):(\d{2})", time_str)
    if match:
        hours = int(match.group(1))
        minutes = int(match.group(2))
        return (hours * 60) + minutes

    try:
        return max(0, int(float(time_str)))
    except (ValueError, TypeError):
        return 0


def format_minutes_to_time(minutes: int) -> str:
    """Convert integer minutes from 00:00 to 'HH:MM' string format."""
    mins = max(0, int(minutes))
    hours = (mins // 60) % 24
    rem_mins = mins % 60
    return f"{hours:02d}:{rem_mins:02d}"


def windows_overlap(start_a: int, end_a: int, start_b: int, end_b: int) -> bool:
    """Check if two time intervals [start_a, end_a) and [start_b, end_b) overlap.

    Intervals touching at edges (e.g. end_a == start_b) do NOT overlap.
    """
    return start_a < end_b and start_b < end_a


class ResourceEngine:
    """Railway Resource Availability & Conflict Engine.

    Manages reservations and verifies whether shared maintenance resources
    (tower wagons, tampers, welding parties, crane gangs) are collision-free.
    """

    def __init__(self) -> None:
        """Initialize an empty resource reservation ledger."""
        self._reservations: List[ResourceReservation] = []

    def clear(self) -> None:
        """Clear all reservations in this engine instance."""
        self._reservations.clear()

    @property
    def reservations(self) -> List[ResourceReservation]:
        """Return a copy of current active reservations."""
        return list(self._reservations)

    def is_available(
        self,
        resource: str,
        start_time: Union[str, int],
        end_time: Union[str, int],
        exclude_job_id: Optional[str] = None,
    ) -> bool:
        """Check if a specific resource is free during [start_time, end_time).

        Args:
            resource: Identifier of the shared resource (e.g. 'Tower wagon TW-925').
            start_time: Start of requested window ('HH:MM' or minutes).
            end_time: End of requested window ('HH:MM' or minutes).
            exclude_job_id: Optional job ID to ignore (useful for re-scheduling checks).

        Returns:
            True if resource has no overlapping reservations, False otherwise.
        """
        start_m = parse_time_to_minutes(start_time)
        end_m = parse_time_to_minutes(end_time)

        if end_m <= start_m:
            return False

        norm_resource = resource.strip().lower()

        for res in self._reservations:
            if exclude_job_id and res.job_id == exclude_job_id:
                continue

            if res.resource.strip().lower() == norm_resource:
                if windows_overlap(start_m, end_m, res.start_minutes, res.end_minutes):
                    return False

        return True

    def detect_conflicts(
        self,
        job_id: str,
        resources: Sequence[str],
        start_time: Union[str, int],
        end_time: Union[str, int],
    ) -> List[Dict[str, Any]]:
        """Detect all resource collisions for a proposed job placement.

        Args:
            job_id: ID of the job requesting resources (e.g. 'J-02').
            resources: Sequence of resource identifiers required.
            start_time: Window start.
            end_time: Window end.

        Returns:
            List of structured conflict dictionaries. Empty list means feasible.
        """
        start_m = parse_time_to_minutes(start_time)
        end_m = parse_time_to_minutes(end_time)
        conflicts: List[Dict[str, Any]] = []

        if end_m <= start_m:
            for r in resources:
                conflicts.append(
                    ResourceConflict(
                        resource=r,
                        available=False,
                        conflict_with=None,
                        reason=REASON_INVALID_TIME_WINDOW,
                        start_time=str(start_time),
                        end_time=str(end_time),
                    ).to_dict()
                )
            return conflicts

        for resource in resources:
            norm_r = resource.strip().lower()
            conflict_found = False

            for res in self._reservations:
                if res.job_id == job_id:
                    continue

                if res.resource.strip().lower() == norm_r:
                    if windows_overlap(start_m, end_m, res.start_minutes, res.end_minutes):
                        conflicts.append(
                            ResourceConflict(
                                resource=resource,
                                available=False,
                                conflict_with=res.job_id,
                                reason=REASON_RESOURCE_CONFLICT,
                                start_time=format_minutes_to_time(res.start_minutes),
                                end_time=format_minutes_to_time(res.end_minutes),
                            ).to_dict()
                        )
                        conflict_found = True
                        break  # Found conflict for this resource

        return conflicts

    def reserve_window(
        self,
        job_id: str,
        resource: str,
        start_time: Union[str, int],
        end_time: Union[str, int],
    ) -> bool:
        """Reserve a single resource for a job in [start_time, end_time).

        Returns:
            True if reservation was successful, False if a conflict exists.
        """
        if not self.is_available(resource, start_time, end_time, exclude_job_id=job_id):
            return False

        start_m = parse_time_to_minutes(start_time)
        end_m = parse_time_to_minutes(end_time)

        self._reservations.append(
            ResourceReservation(
                job_id=job_id,
                resource=resource,
                start_minutes=start_m,
                end_minutes=end_m,
                start_time_str=format_minutes_to_time(start_m),
                end_time_str=format_minutes_to_time(end_m),
            )
        )
        return True

    def reserve_all(
        self,
        job_id: str,
        resources: Sequence[str],
        start_time: Union[str, int],
        end_time: Union[str, int],
    ) -> bool:
        """Atomically reserve all requested resources.

        If any resource has a conflict, NONE are reserved.

        Returns:
            True if all resources were reserved successfully, False otherwise.
        """
        conflicts = self.detect_conflicts(job_id, resources, start_time, end_time)
        if conflicts:
            return False

        for r in resources:
            self.reserve_window(job_id, r, start_time, end_time)
        return True

    def release_window(
        self,
        job_id: str,
        resource: Optional[str] = None,
    ) -> int:
        """Release reservations for a job.

        If resource is specified, releases only that resource for the job.
        Otherwise releases all reservations held by job_id.

        Returns:
            Count of released reservations.
        """
        initial_count = len(self._reservations)
        if resource is not None:
            norm_r = resource.strip().lower()
            self._reservations = [
                res
                for res in self._reservations
                if not (res.job_id == job_id and res.resource.strip().lower() == norm_r)
            ]
        else:
            self._reservations = [
                res for res in self._reservations if res.job_id != job_id
            ]

        return initial_count - len(self._reservations)

    def explain(
        self,
        resource: str,
        start_time: Union[str, int],
        end_time: Union[str, int],
        conflict_with: Optional[str] = None,
    ) -> str:
        """Generate a human-readable explanation of resource availability or conflict."""
        s_str = format_minutes_to_time(parse_time_to_minutes(start_time))
        e_str = format_minutes_to_time(parse_time_to_minutes(end_time))

        if conflict_with:
            return (
                f"Resource Conflict: '{resource}' is already occupied during {s_str}–{e_str} "
                f"by Job {conflict_with} (reason: {REASON_RESOURCE_CONFLICT}). "
                f"Parallel scheduling of this asset is physically infeasible."
            )

        avail = self.is_available(resource, start_time, end_time)
        if avail:
            return f"Resource Available: '{resource}' is completely free during {s_str}–{e_str}."
        else:
            return (
                f"Resource Unavailable: '{resource}' has an active booking during {s_str}–{e_str} "
                f"(reason: {REASON_RESOURCE_CONFLICT})."
            )


# Default global instance for convenience and stateless/stateful usage
default_resource_engine = ResourceEngine()
