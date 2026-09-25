"""Conflict Diagnosis Engine for Railway Block Planning.

Upgrades the planner from a black-box optimizer into an explainable planning engine.
Generates structured blocking constraints, canonical reason codes, and non-fabricated
operational explanations for deferred jobs and INFEASIBLE solver outcomes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple, Union

from backend.app.services.buffer import BufferEngine
from backend.app.services.priority import MaintenanceJob, PriorityEngine
from backend.app.services.reason_codes import (
    BLOCK_CAPACITY,
    CANONICAL_REASON_CODES,
    INCOMPATIBLE_WORK,
    INSUFFICIENT_WINDOW,
    ISOLATION_CONFLICT,
    LOCKED_ASSIGNMENT,
    LOWER_PRIORITY,
    NO_FEASIBLE_WINDOW,
    REASON_DESCRIPTIONS,
    RESOURCE_CONFLICT,
    SECTION_RESTRICTION,
    TRAIN_CONFLICT,
)
from backend.app.services.resources import parse_time_to_minutes, windows_overlap


# Backward compatibility constants
REASON_INSUFFICIENT_WINDOW: str = INSUFFICIENT_WINDOW
REASON_TRAIN_CONFLICT: str = TRAIN_CONFLICT
REASON_RESOURCE_CONFLICT: str = RESOURCE_CONFLICT
REASON_ISOLATION_CONFLICT: str = ISOLATION_CONFLICT
REASON_INCOMPATIBLE_WORK: str = INCOMPATIBLE_WORK
REASON_LOWER_PRIORITY: str = LOWER_PRIORITY
REASON_BLOCK_CAPACITY: str = BLOCK_CAPACITY
REASON_NO_FEASIBLE_WINDOW: str = NO_FEASIBLE_WINDOW
REASON_LOCKED_ASSIGNMENT: str = LOCKED_ASSIGNMENT
REASON_SECTION_RESTRICTION: str = SECTION_RESTRICTION


@dataclass
class JobDiagnostic:
    """Structured diagnostic record for a maintenance job."""

    job_id: str
    scheduled: bool
    status: str = "DEFERRED"  # "SCHEDULED" | "DEFERRED"
    assigned_window_id: Optional[str] = None
    reason_codes: List[str] = field(default_factory=list)
    blocking_constraints: List[str] = field(default_factory=list)
    explanation: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary matching required API shape."""
        return {
            "job_id": self.job_id,
            "status": "SCHEDULED" if self.scheduled else "DEFERRED",
            "scheduled": self.scheduled,
            "reason_codes": list(self.reason_codes),
            "blocking_constraints": list(self.blocking_constraints),
            "explanation": self.explanation,
        }


class DiagnosticsEngine:
    """Evaluates and explains scheduling outcomes, conflicts, and deferrals."""

    @classmethod
    def collect_blocking_constraints(
        cls,
        job: Union[MaintenanceJob, Dict[str, Any]],
        candidate_windows: Sequence[Dict[str, Any]],
        scheduled_assignments: Optional[Sequence[Dict[str, Any]]] = None,
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        section_info: Optional[Dict[str, Any]] = None,
    ) -> Tuple[List[str], Set[str]]:
        """Inspect actual planner facts to collect ALL blocking constraints and reason codes.

        Does NOT stop after the first conflict; accumulates all applicable barriers.
        """
        job_id = str(PriorityEngine._extract_field(job, "id", "job_id", "jobId", default=""))
        corridor = str(PriorityEngine._extract_field(job, "corridor_id", "corridorId", default=""))
        needs_power = bool(PriorityEngine._extract_field(job, "needs_power_isolation", "needsPowerIsolation", default=False))
        resources = [r.strip() for r in (PriorityEngine._extract_field(job, "resources", default=[]) or [])]
        protected_dur = BufferEngine.protected_duration(job)

        assignments = list(scheduled_assignments or [])
        blocking_constraints: List[str] = []
        reason_codes: Set[str] = set()

        # 1. Locked Assignment Check
        if locked_assignments and job_id in locked_assignments:
            locked_w = locked_assignments[job_id]
            valid_window_ids = [str(w.get("id") or w.get("windowId") or "") for w in candidate_windows]
            if locked_w not in valid_window_ids:
                reason_codes.add(LOCKED_ASSIGNMENT)
                blocking_constraints.append(
                    f"Job {job_id} is locked to window '{locked_w}', which does not exist in tonight's plan."
                )

        # 2. Candidate Corridor Matching
        matching_windows = [
            w for w in candidate_windows
            if str(w.get("corridorId") or w.get("corridor_id") or "") == corridor
        ]

        if not matching_windows:
            reason_codes.add(NO_FEASIBLE_WINDOW)
            blocking_constraints.append(
                f"No available maintenance windows on corridor {corridor} tonight."
            )
            return blocking_constraints, reason_codes

        # 3. Section Restriction (Single-line corridor constraints)
        if section_info:
            line_type = str(section_info.get("line") or "").upper()
            if line_type == "SINGLE" and section_info.get("activeOpposingBlock"):
                reason_codes.add(SECTION_RESTRICTION)
                blocking_constraints.append(
                    f"Single-line restriction on corridor {corridor}: concurrent opposing traffic prevents block possession."
                )

        for w in matching_windows:
            w_id = str(w.get("id") or w.get("windowId") or "")
            w_min = int(w.get("minutes") or 0)
            w_power = bool(w.get("allowsPowerIsolation") or w.get("allows_power_isolation") or False)
            w_start = parse_time_to_minutes(w.get("start") or 0)
            w_end = parse_time_to_minutes(w.get("end") or 0)

            # A. Window Capacity / Duration
            if protected_dur > w_min:
                reason_codes.add(BLOCK_CAPACITY)
                reason_codes.add(INSUFFICIENT_WINDOW)  # Backward compatibility
                blocking_constraints.append(
                    f"Remaining window {w_id} ({w_min} min) is shorter than required protected duration ({protected_dur} min)."
                )

            # B. Power Isolation Capability
            if needs_power and not w_power:
                reason_codes.add(ISOLATION_CONFLICT)
                blocking_constraints.append(
                    f"Job requires OHE power isolation, but window {w_id} has traction feed energized."
                )

            # C. Protected Train Movement Conflicts
            if train_movements:
                for tr in train_movements:
                    tr_corridor = str(tr.get("corridorId") or tr.get("corridor_id") or "")
                    if tr_corridor == corridor:
                        tr_start = parse_time_to_minutes(tr.get("start") or 0)
                        tr_end = parse_time_to_minutes(tr.get("end") or 0)
                        if windows_overlap(w_start, w_end, tr_start, tr_end):
                            tr_name = tr.get("name") or tr.get("number") or "Protected train"
                            tr_s_str = tr.get("start", "00:00")
                            tr_e_str = tr.get("end", "00:00")
                            reason_codes.add(TRAIN_CONFLICT)
                            blocking_constraints.append(
                                f"Protected {tr_name} movement occupies {tr_s_str}–{tr_e_str} on corridor {corridor}."
                            )

            # D. Incompatible Work in this window
            assigned_in_w = [
                a for a in assignments
                if str(a.get("windowId") or a.get("window_id") or "") == w_id
            ]
            if compat_groups and assigned_in_w:
                for a in assigned_in_w:
                    other_id = str(a.get("jobId") or a.get("job_id") or "")
                    for cg in compat_groups:
                        cg_jobs = list(cg.get("jobIds") or cg.get("job_ids") or [])
                        if job_id in cg_jobs and other_id in cg_jobs:
                            cg_status = str(cg.get("status") or "").lower()
                            if cg_status == "incompatible":
                                reason_codes.add(INCOMPATIBLE_WORK)
                                cg_title = cg.get("title") or "Conflicting work methods"
                                blocking_constraints.append(
                                    f"Incompatible work methods with {other_id} ({cg_title}) in window {w_id}."
                                )

            # E. Resource Contention with scheduled jobs
            if resources and assigned_in_w:
                for a in assigned_in_w:
                    other_id = str(a.get("jobId") or a.get("job_id") or "")
                    other_res = [r.strip() for r in (a.get("resources") or [])]
                    shared = set(r.lower() for r in resources).intersection(r.lower() for r in other_res)
                    if shared:
                        reason_codes.add(RESOURCE_CONFLICT)
                        for r_name in shared:
                            blocking_constraints.append(
                                f"Shared resource '{r_name}' is reserved by {other_id} during window {w_id}."
                            )

        # Deduplicate blocking constraints while preserving order
        deduped_constraints = list(dict.fromkeys(blocking_constraints))

        # Fallback to LOWER_PRIORITY if no hard physical barrier prevented scheduling
        if not reason_codes:
            reason_codes.add(LOWER_PRIORITY)
            deduped_constraints.append(
                "Window capacity allocated to higher-priority emergency or safety-critical maintenance."
            )

        return deduped_constraints, reason_codes

    @classmethod
    def map_reason_codes(cls, codes: Set[str]) -> List[str]:
        """Sort reason codes deterministically based on standard hierarchy."""
        priority_order = {code: i for i, code in enumerate(CANONICAL_REASON_CODES)}
        return sorted(list(codes), key=lambda c: (priority_order.get(c, 99), c))

    @classmethod
    def build_explanation(
        cls,
        job_id: str,
        blocking_constraints: List[str],
        reason_codes: List[str],
    ) -> str:
        """Compose an operational, human-readable explanation derived from real constraints."""
        if not blocking_constraints:
            return f"Job {job_id} was deferred due to general corridor capacity constraints."

        constraint_summary = " ".join(blocking_constraints)
        return constraint_summary

    @classmethod
    def diagnose_job(
        cls,
        job: Union[MaintenanceJob, Dict[str, Any]],
        candidate_windows: Sequence[Dict[str, Any]],
        scheduled_assignments: Optional[Sequence[Dict[str, Any]]] = None,
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        section_info: Optional[Dict[str, Any]] = None,
    ) -> JobDiagnostic:
        """Perform full diagnostic evaluation for a single job."""
        job_id = str(PriorityEngine._extract_field(job, "id", "job_id", "jobId", default="UNKNOWN"))

        constraints, codes_set = cls.collect_blocking_constraints(
            job=job,
            candidate_windows=candidate_windows,
            scheduled_assignments=scheduled_assignments,
            compat_groups=compat_groups,
            train_movements=train_movements,
            locked_assignments=locked_assignments,
            section_info=section_info,
        )

        ordered_codes = cls.map_reason_codes(codes_set)
        explanation = cls.build_explanation(job_id, constraints, ordered_codes)

        return JobDiagnostic(
            job_id=job_id,
            scheduled=False,
            status="DEFERRED",
            reason_codes=ordered_codes,
            blocking_constraints=constraints,
            explanation=explanation,
        )

    @classmethod
    def diagnose_deferred_job(
        cls,
        job: Union[MaintenanceJob, Dict[str, Any]],
        candidate_windows: Sequence[Dict[str, Any]],
        scheduled_assignments: Sequence[Dict[str, Any]],
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
    ) -> JobDiagnostic:
        """Backward-compatible alias for diagnose_job."""
        return cls.diagnose_job(
            job=job,
            candidate_windows=candidate_windows,
            scheduled_assignments=scheduled_assignments,
            compat_groups=compat_groups,
            train_movements=train_movements,
            locked_assignments=locked_assignments,
        )

    @classmethod
    def build_infeasible_result(
        cls,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        candidate_windows: Sequence[Dict[str, Any]],
        locked_assignments: Optional[Dict[str, str]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        plan_version: str = "r2",
    ) -> Dict[str, Any]:
        """Build structured, non-fabricated response when CP-SAT proves INFEASIBLE."""
        all_constraints: List[str] = []
        all_codes: Set[str] = set()
        affected_jobs: List[str] = []

        for j in jobs:
            j_id = str(PriorityEngine._extract_field(j, "id", "job_id", "jobId", default=""))
            affected_jobs.append(j_id)
            diag = cls.diagnose_job(
                job=j,
                candidate_windows=candidate_windows,
                scheduled_assignments=[],
                compat_groups=compat_groups,
                train_movements=train_movements,
                locked_assignments=locked_assignments,
            )
            all_constraints.extend(diag.blocking_constraints)
            all_codes.update(diag.reason_codes)

        # Deduplicate while preserving order
        deduped_constraints = list(dict.fromkeys(all_constraints))
        if not deduped_constraints:
            deduped_constraints.append(
                "Optimization model cannot satisfy all hard constraints (time, capacity, resources) simultaneously."
            )

        return {
            "status": "INFEASIBLE",
            "plan_version": plan_version,
            "blocking_constraints": deduped_constraints,
            "reason_codes": cls.map_reason_codes(all_codes),
            "affected_jobs": affected_jobs,
            "metrics": {
                "jobs": len(jobs),
                "scheduled": 0,
                "deferred": len(jobs),
                "utilization": 0.0,
            },
        }

    @classmethod
    def summarize_infeasibility(
        cls,
        locked_conflicts: Optional[List[str]] = None,
        unmet_requirements: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Backward-compatible helper for infeasibility summaries."""
        reasons = []
        if locked_conflicts:
            reasons.extend(locked_conflicts)
        if unmet_requirements:
            reasons.extend(unmet_requirements)

        if not reasons:
            reasons.append("Simultaneous hard constraints (resource, isolation, or train limits) could not be satisfied.")

        return {
            "status": "INFEASIBLE",
            "message": "Optimization model cannot satisfy all hard constraints simultaneously.",
            "diagnostics": reasons,
            "blocking_constraints": reasons,
            "reason_codes": [NO_FEASIBLE_WINDOW],
        }
