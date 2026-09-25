"""Evaluation Engine for Railway Block Planning System.

Feature 28: Baseline Comparison
Compares three planning approaches using the exact same input:
1. EARLIEST_AVAILABLE: Greedily assigns each job to the earliest chronologically valid block window.
2. GREEDY_PRIORITY: Sorts jobs by priority (Tier 0 -> Tier 4, internal urgency score) and greedily fills feasible windows.
3. CP_SAT: Global mathematical optimization using Google OR-Tools CP-SAT.

Every mode receives identical:
- jobs
- windows
- train movements
- resources
- compatibility rules
- isolation rules
- locked assignments

Returns factual, computed metrics only without declaring a winner.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple, Union

from backend.app.services.buffer import BufferEngine
from backend.app.services.objective import ObjectiveBuilder
from backend.app.services.optimizer import CpSatOptimizer
from backend.app.services.planner import Planner, PlannerResult
from backend.app.services.priority import MaintenanceJob, PriorityEngine, Tier
from backend.app.services.resources import parse_time_to_minutes, windows_overlap


class EvaluationMode(str, Enum):
    """Supported baseline comparison modes."""

    EARLIEST_AVAILABLE = "EARLIEST_AVAILABLE"
    GREEDY_PRIORITY = "GREEDY_PRIORITY"
    CP_SAT = "CP_SAT"


@dataclass
class EvaluationMetrics:
    """Factual evaluation metrics computed for a planning run."""

    jobs_completed: int
    critical_backlog: int
    train_impact: int
    block_utilization: float
    possessions_used: int
    deferred_jobs: int
    occupied_minutes: int = 0
    unused_minutes: int = 0
    combined_possessions: int = 0
    critical_completed: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "jobs_completed": self.jobs_completed,
            "critical_backlog": self.critical_backlog,
            "train_impact": self.train_impact,
            "block_utilization": self.block_utilization,
            "possessions_used": self.possessions_used,
            "deferred_jobs": self.deferred_jobs,
            "occupied_minutes": self.occupied_minutes,
            "unused_minutes": self.unused_minutes,
            "combined_possessions": self.combined_possessions,
            "critical_completed": self.critical_completed,
        }


@dataclass
class ModeEvaluationResult:
    """Evaluation result for one specific planning mode."""

    mode: str
    status: str
    assignments: List[Dict[str, Any]]
    deferred_jobs: List[Dict[str, Any]]
    metrics: Dict[str, Any]
    train_impacts: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary matching required output."""
        return {
            "mode": self.mode,
            "status": self.status,
            "assignments": list(self.assignments),
            "deferred_jobs": list(self.deferred_jobs),
            "metrics": dict(self.metrics),
            "train_impacts": list(self.train_impacts),
        }


class EvaluationEngine:
    """Evaluation System comparing EARLIEST_AVAILABLE, GREEDY_PRIORITY, and CP_SAT."""

    @classmethod
    def evaluate(
        cls,
        scenario_id: Optional[str] = None,
        modes: Optional[Sequence[Union[str, EvaluationMode]]] = None,
        jobs: Optional[Sequence[Union[MaintenanceJob, Dict[str, Any]]]] = None,
        windows: Optional[Sequence[Dict[str, Any]]] = None,
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        supported_departments: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Run evaluation comparison across requested modes using identical inputs."""
        # If dataset is not explicitly provided, resolve from scenario engine
        if jobs is None or windows is None:
            from backend.app.services.scenarios import ScenarioEngine

            sc_id = scenario_id or "normal"
            scenario = ScenarioEngine.get_scenario(sc_id)
            jobs = scenario.jobs
            windows = scenario.windows
            compat_groups = scenario.compat_groups
            train_movements = scenario.train_movements
            locked_assignments = scenario.locked_assignments
            if not scenario_id:
                scenario_id = sc_id

        # Normalize requested modes
        requested_modes = []
        if modes:
            for m in modes:
                val = m.value if isinstance(m, EvaluationMode) else str(m)
                requested_modes.append(val)
        else:
            requested_modes = [
                EvaluationMode.EARLIEST_AVAILABLE.value,
                EvaluationMode.GREEDY_PRIORITY.value,
                EvaluationMode.CP_SAT.value,
            ]

        results: Dict[str, Any] = {}

        for mode_str in requested_modes:
            if mode_str == EvaluationMode.EARLIEST_AVAILABLE.value:
                res = cls.run_earliest_available(
                    jobs=jobs,
                    windows=windows,
                    compat_groups=compat_groups,
                    train_movements=train_movements,
                    locked_assignments=locked_assignments,
                )
                results[mode_str] = res.to_dict()

            elif mode_str == EvaluationMode.GREEDY_PRIORITY.value:
                res = cls.run_greedy_priority(
                    jobs=jobs,
                    windows=windows,
                    compat_groups=compat_groups,
                    train_movements=train_movements,
                    locked_assignments=locked_assignments,
                )
                results[mode_str] = res.to_dict()

            elif mode_str == EvaluationMode.CP_SAT.value:
                res = cls.run_cp_sat(
                    jobs=jobs,
                    windows=windows,
                    compat_groups=compat_groups,
                    train_movements=train_movements,
                    locked_assignments=locked_assignments,
                    supported_departments=supported_departments,
                )
                results[mode_str] = res.to_dict()

        return {
            "scenario_id": scenario_id or "custom",
            "results": results,
        }

    # -----------------------------------------------------------------------
    # 1. EARLIEST_AVAILABLE Heuristic
    # -----------------------------------------------------------------------
    @classmethod
    def run_earliest_available(
        cls,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
    ) -> ModeEvaluationResult:
        """First valid block window in chronological order; respects all hard constraints."""
        # Keep jobs in original input arrival order
        return cls._run_heuristic(
            jobs=list(jobs),
            windows=list(windows),
            sort_windows_by="earliest",
            compat_groups=compat_groups,
            train_movements=train_movements,
            locked_assignments=locked_assignments,
            mode_name=EvaluationMode.EARLIEST_AVAILABLE.value,
        )

    # -----------------------------------------------------------------------
    # 2. GREEDY_PRIORITY Heuristic
    # -----------------------------------------------------------------------
    @classmethod
    def run_greedy_priority(
        cls,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
    ) -> ModeEvaluationResult:
        """Highest priority jobs first; fills feasible windows greedily."""
        # Rank jobs strictly by PriorityEngine (Tier 0 -> Tier 4, internal urgency score)
        ranked_jobs = PriorityEngine.rank_jobs(jobs)
        return cls._run_heuristic(
            jobs=ranked_jobs,
            windows=list(windows),
            sort_windows_by="earliest",
            compat_groups=compat_groups,
            train_movements=train_movements,
            locked_assignments=locked_assignments,
            mode_name=EvaluationMode.GREEDY_PRIORITY.value,
        )

    # -----------------------------------------------------------------------
    # 3. CP_SAT Global Optimizer
    # -----------------------------------------------------------------------
    @classmethod
    def run_cp_sat(
        cls,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        supported_departments: Optional[List[str]] = None,
    ) -> ModeEvaluationResult:
        """OR-Tools CP-SAT multi-objective global optimization."""
        planner = Planner(plan_version="r1")
        plan_result = planner.solve(
            jobs=jobs,
            windows=windows,
            compat_groups=compat_groups,
            train_movements=train_movements,
            locked_assignments=locked_assignments,
            supported_departments=supported_departments,
        )

        metrics = cls.compute_metrics(
            jobs=jobs,
            windows=windows,
            assignments=plan_result.assignments,
            deferred_jobs=plan_result.deferred_jobs,
            train_movements=train_movements,
        )

        return ModeEvaluationResult(
            mode=EvaluationMode.CP_SAT.value,
            status=plan_result.status,
            assignments=plan_result.assignments,
            deferred_jobs=plan_result.deferred_jobs,
            metrics=metrics.to_dict(),
            train_impacts=plan_result.metrics.get("train_impact", []),
        )

    # -----------------------------------------------------------------------
    # Shared Heuristic Execution & Hard Constraint Validation
    # -----------------------------------------------------------------------
    @classmethod
    def _run_heuristic(
        cls,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        sort_windows_by: str = "earliest",
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        mode_name: str = "HEURISTIC",
    ) -> ModeEvaluationResult:
        """Deterministic heuristic placement verifying every hard constraint."""
        # Index windows and sort chronologically
        sorted_windows = sorted(
            windows,
            key=lambda w: parse_time_to_minutes(w.get("start") or 0),
        )

        # Build incompatibility lookup
        incompatible_pairs: Set[Tuple[str, str]] = set()
        if compat_groups:
            for cg in compat_groups:
                if str(cg.get("status") or "").lower() == "incompatible":
                    cg_jobs = [str(jid) for jid in (cg.get("jobIds") or cg.get("job_ids") or [])]
                    for i in range(len(cg_jobs)):
                        for k in range(i + 1, len(cg_jobs)):
                            incompatible_pairs.add((cg_jobs[i], cg_jobs[k]))
                            incompatible_pairs.add((cg_jobs[k], cg_jobs[i]))

        # State tracking
        window_occupancy: Dict[str, int] = {str(w.get("id") or w.get("windowId")): 0 for w in windows}
        window_assigned_jobs: Dict[str, List[str]] = {str(w.get("id") or w.get("windowId")): [] for w in windows}
        # Resource allocations: resource_name -> list of (start_min, end_min, job_id)
        resource_allocations: Dict[str, List[Tuple[int, int, str]]] = {}

        assignments: List[Dict[str, Any]] = []
        deferred: List[Dict[str, Any]] = []

        # Lock map
        locks = locked_assignments or {}

        for job in jobs:
            j_id = str(PriorityEngine._extract_field(job, "id", "job_id", "jobId", default=""))
            j_corridor = str(PriorityEngine._extract_field(job, "corridor_id", "corridorId", default=""))
            needs_power = bool(PriorityEngine._extract_field(job, "needs_power_isolation", "needsPowerIsolation", default=False))
            prot_dur = BufferEngine.protected_duration(job)
            est_dur = int(PriorityEngine._extract_field(job, "duration_minutes", "minutes", default=60))
            raw_res = PriorityEngine._extract_field(job, "resources", default=[]) or []
            j_resources = [r.strip().lower() for r in raw_res]

            placed = False
            defer_reason = "NO_FEASIBLE_WINDOW"
            defer_code = "NO_FEASIBLE_WINDOW"

            # Check candidate windows
            for window in sorted_windows:
                w_id = str(window.get("id") or window.get("windowId"))
                w_corridor = str(window.get("corridorId") or window.get("corridor_id") or "")
                w_allows_power = bool(window.get("allowsPowerIsolation") or window.get("allows_power_isolation") or False)
                w_minutes = int(window.get("minutes") or 0)
                w_start = parse_time_to_minutes(window.get("start") or 0)
                w_end = parse_time_to_minutes(window.get("end") or 0)

                # 1. Locked constraint
                if j_id in locks and locks[j_id] != w_id:
                    continue

                # 2. Corridor matching
                if j_corridor and w_corridor and j_corridor != w_corridor:
                    continue

                # 3. Power isolation
                if needs_power and not w_allows_power:
                    defer_reason = f"Window {w_id} live feed; job requires power isolation"
                    defer_code = "ISOLATION_CONFLICT"
                    continue

                # 4. Capacity constraint
                if window_occupancy[w_id] + prot_dur > w_minutes:
                    defer_reason = f"Window {w_id} capacity exceeded ({w_minutes}m)"
                    defer_code = "INSUFFICIENT_WINDOW"
                    continue

                # 5. Protected train conflict
                has_train_conflict = False
                if train_movements:
                    for tr in train_movements:
                        tr_corr = str(tr.get("corridorId") or tr.get("corridor_id") or "")
                        if tr_corr == w_corridor and tr.get("isProtected", True):
                            tr_s = parse_time_to_minutes(tr.get("start") or 0)
                            tr_e = parse_time_to_minutes(tr.get("end") or 0)
                            if windows_overlap(w_start, w_end, tr_s, tr_e):
                                gap_before = max(0, tr_s - w_start)
                                gap_after = max(0, w_end - tr_e)
                                if prot_dur > gap_before and prot_dur > gap_after:
                                    has_train_conflict = True
                                    break
                if has_train_conflict:
                    defer_reason = f"Protected train movement blocks {w_corridor}"
                    defer_code = "TRAIN_CONFLICT"
                    continue

                # 6. Work incompatibility
                has_incompat = False
                for other_jid in window_assigned_jobs[w_id]:
                    if (j_id, other_jid) in incompatible_pairs:
                        has_incompat = True
                        break
                if has_incompat:
                    defer_reason = "Incompatible work already placed in block"
                    defer_code = "INCOMPATIBLE_WORK"
                    continue

                # 7. Resource availability
                res_conflict = False
                for r_name in j_resources:
                    if r_name in resource_allocations:
                        for a_start, a_end, a_jid in resource_allocations[r_name]:
                            if windows_overlap(w_start, w_end, a_start, a_end):
                                res_conflict = True
                                break
                    if res_conflict:
                        break
                if res_conflict:
                    defer_reason = f"Resource contention on shared resource"
                    defer_code = "RESOURCE_CONFLICT"
                    continue

                # All hard constraints satisfied -> assign job
                window_occupancy[w_id] += prot_dur
                window_assigned_jobs[w_id].append(j_id)
                for r_name in j_resources:
                    if r_name not in resource_allocations:
                        resource_allocations[r_name] = []
                    resource_allocations[r_name].append((w_start, w_end, j_id))

                assignments.append({
                    "jobId": j_id,
                    "job_id": j_id,
                    "windowId": w_id,
                    "window_id": w_id,
                    "start": window.get("start", "01:00"),
                    "end": window.get("end", "04:00"),
                    "corridorId": w_corridor,
                    "duration_minutes": est_dur,
                    "resources": list(j_resources),
                    "status": "APPROVED",
                    "note": f"Scheduled by {mode_name}",
                })
                placed = True
                break

            if not placed:
                deferred.append({
                    "jobId": j_id,
                    "job_id": j_id,
                    "status": "DEFERRED",
                    "code": defer_code,
                    "reason": defer_reason,
                    "reason_codes": [defer_code],
                })

        metrics = cls.compute_metrics(
            jobs=jobs,
            windows=windows,
            assignments=assignments,
            deferred_jobs=deferred,
            train_movements=train_movements,
        )

        return ModeEvaluationResult(
            mode=mode_name,
            status="OPTIMAL" if not deferred else "FEASIBLE",
            assignments=assignments,
            deferred_jobs=deferred,
            metrics=metrics.to_dict(),
            train_impacts=[
                f"Path protected for {tr.get('name') or tr.get('id')} on {tr.get('corridorId')}"
                for tr in (train_movements or [])
                if tr.get("isProtected", True)
            ],
        )

    # -----------------------------------------------------------------------
    # Factual Metrics Computation
    # -----------------------------------------------------------------------
    @classmethod
    def compute_metrics(
        cls,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        assignments: Sequence[Dict[str, Any]],
        deferred_jobs: Sequence[Dict[str, Any]],
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> EvaluationMetrics:
        """Compute standard, non-fabricated factual metrics across all modes."""
        job_map = {
            str(PriorityEngine._extract_field(j, "id", "job_id", "jobId", default="")): j
            for j in jobs
        }

        jobs_completed = len(assignments)
        deferred_count = len(deferred_jobs)

        # Critical backlog: deferred Tier 0 or Tier 1 jobs
        critical_backlog = 0
        for d in deferred_jobs:
            d_id = str(d.get("jobId") or d.get("job_id") or "")
            if d_id in job_map:
                tier = PriorityEngine.assign_tier(job_map[d_id])
                if tier in (Tier.TIER_0, Tier.TIER_1):
                    critical_backlog += 1

        # Critical completed
        critical_completed = 0
        for a in assignments:
            a_id = str(a.get("jobId") or a.get("job_id") or "")
            if a_id in job_map:
                tier = PriorityEngine.assign_tier(job_map[a_id])
                if tier in (Tier.TIER_0, Tier.TIER_1):
                    critical_completed += 1

        # Total window minutes & occupied minutes
        total_window_mins = sum(int(w.get("minutes") or 0) for w in windows)
        occupied_minutes = 0
        for a in assignments:
            a_id = str(a.get("jobId") or a.get("job_id") or "")
            if a_id in job_map:
                duration = int(PriorityEngine._extract_field(job_map[a_id], "duration_minutes", "minutes", default=0))
                occupied_minutes += duration

        unused_minutes = max(0, total_window_mins - occupied_minutes)
        block_utilization = (
            round((occupied_minutes / total_window_mins * 100.0), 1)
            if total_window_mins > 0
            else 0.0
        )

        # Possessions used (unique windows with >= 1 job)
        windows_used: Dict[str, int] = {}
        for a in assignments:
            w_id = str(a.get("windowId") or a.get("window_id") or "")
            if w_id:
                windows_used[w_id] = windows_used.get(w_id, 0) + 1

        possessions_used = len(windows_used)

        # Combined possessions: windows containing >= 2 jobs (bundled work)
        combined_possessions = sum(1 for count in windows_used.values() if count >= 2)

        # Train impact: protected train delays or caution minutes
        # Factual computation: if a protected train overlaps an active corridor window,
        # compute traffic gap pressure or delay minutes (15 min standard caution per active train interaction)
        train_impact = 0
        if train_movements:
            for tr in train_movements:
                tr_corr = str(tr.get("corridorId") or tr.get("corridor_id") or "")
                tr_s = parse_time_to_minutes(tr.get("start") or 0)
                tr_e = parse_time_to_minutes(tr.get("end") or 0)
                # Check against windows utilized by assignments
                for w in windows:
                    w_id = str(w.get("id") or w.get("windowId") or "")
                    if w_id in windows_used and str(w.get("corridorId") or w.get("corridor_id")) == tr_corr:
                        w_s = parse_time_to_minutes(w.get("start") or 0)
                        w_e = parse_time_to_minutes(w.get("end") or 0)
                        if windows_overlap(w_s, w_e, tr_s, tr_e):
                            train_impact += int(tr.get("delayMinutes", 15))

        return EvaluationMetrics(
            jobs_completed=jobs_completed,
            critical_backlog=critical_backlog,
            train_impact=train_impact,
            block_utilization=block_utilization,
            possessions_used=possessions_used,
            deferred_jobs=deferred_count,
            occupied_minutes=occupied_minutes,
            unused_minutes=unused_minutes,
            combined_possessions=combined_possessions,
            critical_completed=critical_completed,
        )
