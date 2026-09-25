"""Google OR-Tools CP-SAT Optimization Model for Railway Block Planning.

Implements the core combinatorial scheduling formulation:
- Binary decision variables for window assignment vs deferral
- Hard constraints: Compatibility, Isolation, Protected Trains, Resources, Section Restrictions, Possession Durations, Locked Assignments
- Soft objectives: Priority, Maintenance completion, Train impact, Block utilization, Anti-starvation penalties
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple, Union

from ortools.sat.python import cp_model

from backend.app.services.buffer import BufferEngine
from backend.app.services.fairness import FairnessEngine
from backend.app.services.objective import ObjectiveBuilder
from backend.app.services.priority import MaintenanceJob, PriorityEngine
from backend.app.services.resources import ResourceEngine, parse_time_to_minutes, windows_overlap


@dataclass
class OptimizerSolution:
    """Structured solution returned by the CP-SAT solver."""

    status: str  # "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN"
    assigned_jobs: List[Dict[str, Any]]  # [{job_id, window_id, start, end, parallel, note}]
    deferred_job_ids: List[str]
    objective_value: float
    solve_time_seconds: float
    statistics: Dict[str, Any]


class CpSatOptimizer:
    """OR-Tools CP-SAT Railway Maintenance Planner Optimizer."""

    def __init__(
        self,
        objective_builder: Optional[ObjectiveBuilder] = None,
        max_time_in_seconds: float = 10.0,
        deterministic_seed: int = 42,
    ) -> None:
        self.objective_builder = objective_builder or ObjectiveBuilder()
        self.max_time_in_seconds = max_time_in_seconds
        self.deterministic_seed = deterministic_seed

    def optimize(
        self,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,  # job_id -> window_id
        department_fairness: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> OptimizerSolution:
        """Build and solve the CP-SAT optimization model deterministically."""
        model = cp_model.CpModel()

        # Clean job list and index maps
        job_map: Dict[str, Union[MaintenanceJob, Dict[str, Any]]] = {}
        for j in jobs:
            j_id = str(PriorityEngine._extract_field(j, "id", "job_id", "jobId", default=""))
            if j_id:
                job_map[j_id] = j

        job_ids = list(job_map.keys())
        window_ids = [str(w.get("id") or w.get("windowId") or "") for w in windows]
        window_map = {w_id: w for w_id, w in zip(window_ids, windows)}

        if not job_ids or not window_ids:
            return OptimizerSolution(
                status="OPTIMAL" if not job_ids else "FEASIBLE",
                assigned_jobs=[],
                deferred_job_ids=job_ids,
                objective_value=0.0,
                solve_time_seconds=0.0,
                statistics={"branches": 0, "conflicts": 0},
            )

        # -------------------------------------------------------------------
        # 1. Decision Variables
        # -------------------------------------------------------------------
        # x[j, w]: 1 if job j is assigned to window w, 0 otherwise
        x: Dict[Tuple[str, str], cp_model.IntVar] = {}
        for j_id in job_ids:
            for w_id in window_ids:
                x[(j_id, w_id)] = model.NewBoolVar(f"assign_{j_id}_{w_id}")

        # d[j]: 1 if job j is deferred, 0 otherwise
        d: Dict[str, cp_model.IntVar] = {}
        for j_id in job_ids:
            d[j_id] = model.NewBoolVar(f"defer_{j_id}")

        # -------------------------------------------------------------------
        # 2. Assignment / Deferral Exact Cover Constraint
        # Every job is either assigned to exactly one window OR deferred
        # -------------------------------------------------------------------
        for j_id in job_ids:
            model.Add(sum(x[(j_id, w_id)] for w_id in window_ids) + d[j_id] == 1)

        # -------------------------------------------------------------------
        # 3. Hard Constraints
        # -------------------------------------------------------------------

        # A. Locked Assignments
        if locked_assignments:
            for j_id, locked_w_id in locked_assignments.items():
                if j_id in job_ids:
                    if locked_w_id in window_ids:
                        model.Add(x[(j_id, locked_w_id)] == 1)
                        model.Add(d[j_id] == 0)
                    else:
                        # Locked to non-existent window -> infeasible
                        model.Add(d[j_id] == 2)  # Impossible constraint

        # Precompute job properties
        job_durations: Dict[str, int] = {}
        job_corridors: Dict[str, str] = {}
        job_needs_power: Dict[str, bool] = {}
        job_resources: Dict[str, List[str]] = {}

        for j_id, job in job_map.items():
            job_durations[j_id] = BufferEngine.protected_duration(job)
            job_corridors[j_id] = str(PriorityEngine._extract_field(job, "corridor_id", "corridorId", default=""))
            job_needs_power[j_id] = bool(PriorityEngine._extract_field(job, "needs_power_isolation", "needsPowerIsolation", default=False))
            job_resources[j_id] = [
                r.strip().lower() for r in PriorityEngine._extract_field(job, "resources", default=[]) or []
            ]

        # B. Corridor Matching & Isolation Capability & Train Conflicts
        for j_id in job_ids:
            j_corridor = job_corridors[j_id]
            needs_power = job_needs_power[j_id]
            prot_dur = job_durations[j_id]

            for w_id in window_ids:
                window = window_map[w_id]
                w_corridor = str(window.get("corridorId") or window.get("corridor_id") or "")
                w_allows_power = bool(window.get("allowsPowerIsolation") or window.get("allows_power_isolation") or False)
                w_minutes = int(window.get("minutes") or 0)
                w_start = parse_time_to_minutes(window.get("start") or 0)
                w_end = parse_time_to_minutes(window.get("end") or 0)

                # Corridor mismatch
                if j_corridor and w_corridor and j_corridor != w_corridor:
                    model.Add(x[(j_id, w_id)] == 0)
                    continue

                # Power isolation needed but window feed is live
                if needs_power and not w_allows_power:
                    model.Add(x[(j_id, w_id)] == 0)
                    continue

                # Protected job duration exceeds window capacity
                if prot_dur > w_minutes:
                    model.Add(x[(j_id, w_id)] == 0)
                    continue

                # Protected train movements block this corridor during this window
                if train_movements:
                    has_train_block = False
                    for tr in train_movements:
                        tr_corridor = str(tr.get("corridorId") or tr.get("corridor_id") or "")
                        if tr_corridor == w_corridor and tr.get("isProtected", True):
                            tr_start = parse_time_to_minutes(tr.get("start") or 0)
                            tr_end = parse_time_to_minutes(tr.get("end") or 0)
                            if windows_overlap(w_start, w_end, tr_start, tr_end):
                                # Train occupies window; check if remaining gap accommodates job
                                gap_before = max(0, tr_start - w_start)
                                gap_after = max(0, w_end - tr_end)
                                if prot_dur > gap_before and prot_dur > gap_after:
                                    has_train_block = True
                                    break
                    if has_train_block:
                        model.Add(x[(j_id, w_id)] == 0)

        # C. Possession Duration / Capacity per Window
        for w_id in window_ids:
            window = window_map[w_id]
            w_minutes = int(window.get("minutes") or 0)
            model.Add(
                sum(job_durations[j_id] * x[(j_id, w_id)] for j_id in job_ids) <= w_minutes
            )

        # D. Work Incompatibility (e.g. from Compatibility Groups)
        if compat_groups:
            for cg in compat_groups:
                status = str(cg.get("status") or "").lower()
                cg_jobs = [str(jid) for jid in (cg.get("jobIds") or cg.get("job_ids") or [])]
                if status == "incompatible" and len(cg_jobs) >= 2:
                    # Mutual exclusion for all windows
                    for i in range(len(cg_jobs)):
                        for k in range(i + 1, len(cg_jobs)):
                            j1, j2 = cg_jobs[i], cg_jobs[k]
                            if j1 in job_ids and j2 in job_ids:
                                for w_id in window_ids:
                                    model.Add(x[(j1, w_id)] + x[(j2, w_id)] <= 1)

        # E. Resource Collisions (Shared Machinery, Gangs, Tower Wagons)
        for i in range(len(job_ids)):
            for k in range(i + 1, len(job_ids)):
                j1, j2 = job_ids[i], job_ids[k]
                shared_res = set(job_resources[j1]).intersection(job_resources[j2])
                if shared_res:
                    # Cannot share the same window concurrently
                    for w_id in window_ids:
                        model.Add(x[(j1, w_id)] + x[(j2, w_id)] <= 1)

                    # Also cannot be scheduled in different windows that overlap in absolute time
                    for w1_id in window_ids:
                        for w2_id in window_ids:
                            if w1_id != w2_id:
                                w1 = window_map[w1_id]
                                w2 = window_map[w2_id]
                                s1, e1 = parse_time_to_minutes(w1.get("start") or 0), parse_time_to_minutes(w1.get("end") or 0)
                                s2, e2 = parse_time_to_minutes(w2.get("start") or 0), parse_time_to_minutes(w2.get("end") or 0)
                                if windows_overlap(s1, e1, s2, e2):
                                    model.Add(x[(j1, w1_id)] + x[(j2, w2_id)] <= 1)

        # -------------------------------------------------------------------
        # 4. Soft Objectives (Linear Combination)
        # -------------------------------------------------------------------
        matrix = self.objective_builder.build_matrix(
            list(job_map.values()),
            list(window_map.values()),
            department_fairness=department_fairness,
        )
        job_coeffs = matrix["job_coefficients"]
        window_rewards = matrix["window_rewards"]

        objective_terms = []
        for j_id in job_ids:
            # Reward for scheduling
            for w_id in window_ids:
                reward = window_rewards[j_id][w_id]
                objective_terms.append(reward * x[(j_id, w_id)])

            # Penalty for deferring
            defer_cost = job_coeffs[j_id].deferral_penalty
            if defer_cost > 0:
                objective_terms.append(-defer_cost * d[j_id])

        model.Maximize(sum(objective_terms))

        # -------------------------------------------------------------------
        # 5. Solve Deterministically
        # -------------------------------------------------------------------
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.max_time_in_seconds
        solver.parameters.random_seed = self.deterministic_seed
        solver.parameters.num_workers = 1  # Strictly deterministic single worker

        status_code = solver.Solve(model)

        status_str = "UNKNOWN"
        if status_code == cp_model.OPTIMAL:
            status_str = "OPTIMAL"
        elif status_code == cp_model.FEASIBLE:
            status_str = "FEASIBLE"
        elif status_code == cp_model.INFEASIBLE:
            status_str = "INFEASIBLE"
        elif status_code == cp_model.MODEL_INVALID:
            status_str = "MODEL_INVALID"

        assigned_jobs: List[Dict[str, Any]] = []
        deferred_ids: List[str] = []

        if status_str in ("OPTIMAL", "FEASIBLE"):
            for j_id in job_ids:
                assigned = False
                for w_id in window_ids:
                    if solver.Value(x[(j_id, w_id)]) == 1:
                        w = window_map[w_id]
                        assigned_jobs.append({
                            "jobId": j_id,
                            "windowId": w_id,
                            "start": w.get("start", "00:00"),
                            "end": w.get("end", "00:00"),
                            "parallel": False,
                            "note": f"Scheduled in {w_id} ({w.get('corridorId', '')})",
                            "resources": list(job_resources[j_id]),
                        })
                        assigned = True
                        break
                if not assigned:
                    deferred_ids.append(j_id)
        else:
            deferred_ids = list(job_ids)

        return OptimizerSolution(
            status=status_str,
            assigned_jobs=assigned_jobs,
            deferred_job_ids=deferred_ids,
            objective_value=solver.ObjectiveValue() if status_str in ("OPTIMAL", "FEASIBLE") else 0.0,
            solve_time_seconds=round(solver.WallTime(), 3),
            statistics={
                "branches": solver.NumBranches(),
                "conflicts": solver.NumConflicts(),
            },
        )
