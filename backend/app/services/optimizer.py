"""Google OR-Tools CP-SAT Optimization Model for Railway Block Planning.

Implements the core combinatorial scheduling formulation with REAL
scheduling decisions (not whole-window occupancy):

- x[j,w]  : job j assigned to window w (or deferred)
- s[j,w]  : job start minute on the continuous overnight timeline
- e[j,w]  : job end minute = start + setup + work + restore

Hard constraints (rule engine and optimizer can never disagree):
  1. Assignment exact cover  — every job is assigned once or deferred
  2. Locked assignments      — pinned to their window; impossible locks are
                               reported as LOCKED_ASSIGNMENT_CONFLICT, never
                               silently moved
  3. Corridor match          — job corridor must equal window corridor
  4. Block type              — POWER work cannot enter a TRAFFIC-only block
                               (and TRAFFIC work is pointless in a POWER
                               block); POWER_AND_TRAFFIC accepts both
  5. Window capacity         — job possession (setup+work+restore) fits
  6. Train protection        — the job interval must sit inside one safe gap
                               of the window after removing protected
                               movements (temporal overlap on a continuous
                               cross-midnight timeline)
  7. Resource exclusivity    — shared resources cannot run overlapping
                               intervals, even across different windows
  8. Pairwise incompatibility— incompatible jobs never share a window;
                               CONDITIONAL pairs run in a strict order
                               (A finishes before B starts)
  9. No-overlap per window   — jobs inside one window occupy disjoint
                               intervals

Soft objective (configurable, never exposed as an "AI score"):
  maintenance completion + priority tier + train impact penalty +
  utilization bonus + department anti-starvation penalty.

Outputs carry actual job_id / window / start / end / execution mode.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple, Union

from ortools.sat.python import cp_model

from backend.app.services.objective import ObjectiveBuilder
from backend.app.services.priority import MaintenanceJob, PriorityEngine
from backend.app.services.timeline import (
    DAY_MINUTES,
    format_minute_of_day,
    interval_minutes,
    minutes_from_hhmm,
    overlaps,
    train_protection_gaps,
)

JobLike = Union[MaintenanceJob, Dict[str, Any]]


@dataclass
class OptimizerSolution:
    """Structured solution returned by the CP-SAT solver."""

    status: str  # "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "MODEL_INVALID" | "UNKNOWN"
    assigned_jobs: List[Dict[str, Any]]  # [{jobId, windowId, start, end, ...}]
    deferred_job_ids: List[str]
    objective_value: float
    solve_time_seconds: float
    statistics: Dict[str, Any] = field(default_factory=dict)
    locked_conflicts: List[str] = field(default_factory=list)


def _field(job: JobLike, *names: str, default: Any = None) -> Any:
    for name in names:
        if isinstance(job, dict):
            if name in job and job[name] is not None:
                return job[name]
        else:
            value = getattr(job, name, None)
            if value is not None:
                return value
    return default


def _job_id(job: JobLike) -> str:
    return str(_field(job, "id", "job_id", "jobId", default=""))


def _job_minutes(job: JobLike) -> int:
    """Protected possession minutes: setup + work + restore (+ safety buffer)."""
    work = int(_field(job, "duration_minutes", "minutes", default=0) or 0)
    setup = int(_field(job, "setup_duration_minutes", "setup_minutes", default=0) or 0)
    restore = int(_field(job, "restore_duration_minutes", "restore_minutes", default=0) or 0)
    return setup + work + restore


def _job_resources(job: JobLike) -> List[str]:
    return [str(r).strip().lower() for r in (_field(job, "resources", default=[]) or [])]


def _job_block_type(job: JobLike) -> str:
    raw = _field(job, "block_type", default="")
    if hasattr(raw, "value"):
        raw = raw.value
    return str(raw or "").upper()


def _window_corridor(window: Dict[str, Any]) -> str:
    return str(window.get("corridorId") or window.get("corridor_id") or "")


def _window_id(window: Dict[str, Any]) -> str:
    return str(window.get("id") or window.get("windowId") or window.get("window_id") or "")


class CpSatOptimizer:
    """OR-Tools CP-SAT railway maintenance scheduler."""

    def __init__(
        self,
        objective_builder: Optional[ObjectiveBuilder] = None,
        max_time_in_seconds: float = 10.0,
        deterministic_seed: int = 42,
    ) -> None:
        self.objective_builder = objective_builder or ObjectiveBuilder()
        self.max_time_in_seconds = max_time_in_seconds
        self.deterministic_seed = deterministic_seed

    # ------------------------------------------------------------------ API

    def optimize(
        self,
        jobs: Sequence[JobLike],
        windows: Sequence[Dict[str, Any]],
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        department_fairness: Optional[Dict[str, Dict[str, Any]]] = None,
        failed_resources: Optional[Sequence[str]] = None,
    ) -> OptimizerSolution:
        """Build and solve the CP-SAT model deterministically."""
        model = cp_model.CpModel()

        job_map: Dict[str, JobLike] = {}
        for job in jobs:
            jid = _job_id(job)
            if jid:
                job_map[jid] = job
        job_ids = list(job_map.keys())

        window_map: Dict[str, Dict[str, Any]] = {}
        for window in windows:
            wid = _window_id(window)
            if wid:
                window_map[wid] = window
        window_ids = list(window_map.keys())

        locked_conflicts: List[str] = []

        if not job_ids:
            return OptimizerSolution("OPTIMAL", [], [], 0.0, 0.0, {}, [])

        if not window_ids:
            return OptimizerSolution(
                "FEASIBLE",
                [],
                list(job_ids),
                0.0,
                0.0,
                {"branches": 0, "conflicts": 0},
                [],
            )

        # ---------------------------------------------------------------
        # Job properties (possession minutes, resources, block type, tier)
        # ---------------------------------------------------------------
        possession: Dict[str, int] = {jid: _job_minutes(job_map[jid]) for jid in job_ids}
        resources_of: Dict[str, List[str]] = {jid: _job_resources(job_map[jid]) for jid in job_ids}
        failed_set = {str(r).strip().lower() for r in (failed_resources or [])}
        block_type_of: Dict[str, str] = {jid: _job_block_type(job_map[jid]) for jid in job_ids}
        needs_power: Dict[str, bool] = {
            jid: bool(_field(job_map[jid], "needs_power_isolation", "needsPowerIsolation", default=False))
            for jid in job_ids
        }
        corridor_of: Dict[str, str] = {
            jid: str(_field(job_map[jid], "corridor_id", "corridorId", default=""))
            for jid in job_ids
        }

        # ---------------------------------------------------------------
        # 1. Decision variables
        # ---------------------------------------------------------------
        x: Dict[Tuple[str, str], Any] = {}
        start: Dict[Tuple[str, str], Any] = {}
        end: Dict[Tuple[str, str], Any] = {}
        defer: Dict[str, Any] = {}

        horizon_end = DAY_MINUTES * 2  # timeline spans two operational days

        for jid in job_ids:
            defer[jid] = model.NewBoolVar(f"defer_{jid}")
            for wid in window_ids:
                window = window_map[wid]
                w_interval = interval_minutes(window.get("start"), window.get("end"))
                if w_interval is None:
                    w_start = minutes_from_hhmm(window.get("start")) or 0
                    w_end = w_start + int(window.get("minutes") or 0)
                else:
                    w_start, w_end = w_interval
                if w_end < w_start:  # never happen on continuous timeline, but stay safe
                    w_end = w_start
                x[(jid, wid)] = model.NewBoolVar(f"assign_{jid}_{wid}")
                start[(jid, wid)] = model.NewIntVar(w_start, w_end, f"start_{jid}_{wid}")
                end[(jid, wid)] = model.NewIntVar(w_start, w_end, f"end_{jid}_{wid}")

        # ---------------------------------------------------------------
        # 2. Exact cover: assign to exactly one window or defer
        # ---------------------------------------------------------------
        for jid in job_ids:
            model.Add(sum(x[(jid, wid)] for wid in window_ids) + defer[jid] == 1)

        # Interval linkage: when assigned, [start, end) == [s, s+possession)
        for jid in job_ids:
            for wid in window_ids:
                window = window_map[wid]
                w_interval = interval_minutes(window.get("start"), window.get("end"))
                if w_interval is None:
                    w_start = minutes_from_hhmm(window.get("start")) or 0
                    w_end = w_start + int(window.get("minutes") or 0)
                else:
                    w_start, w_end = w_interval
                if w_end < w_start:
                    w_end = w_start
                model.Add(start[(jid, wid)] + possession[jid] == end[(jid, wid)]).OnlyEnforceIf(x[(jid, wid)])
                model.Add(start[(jid, wid)] >= w_start).OnlyEnforceIf(x[(jid, wid)])
                model.Add(end[(jid, wid)] <= w_end).OnlyEnforceIf(x[(jid, wid)])

        # ---------------------------------------------------------------
        # 3. Hard per-(job, window) feasibility filters
        # ---------------------------------------------------------------
        for jid in job_ids:
            # 3.0 Failed resource: the job cannot run at all this replan.
            if failed_set and (set(resources_of[jid]) & failed_set):
                for wid in window_ids:
                    model.Add(x[(jid, wid)] == 0)
                continue
            for wid in window_ids:
                window = window_map[wid]
                w_interval = interval_minutes(window.get("start"), window.get("end"))
                if w_interval is None:
                    w_start = minutes_from_hhmm(window.get("start")) or 0
                    w_end = w_start + int(window.get("minutes") or 0)
                else:
                    w_start, w_end = w_interval

                # 3a. Corridor match
                if corridor_of[jid] and _window_corridor(window) and corridor_of[jid] != _window_corridor(window):
                    model.Add(x[(jid, wid)] == 0)
                    continue

                # 3b. Block type hard constraint (rule engine agreement)
                w_block_type = str(window.get("blockType") or window.get("block_type") or "").upper()
                job_bt = block_type_of[jid]
                if w_block_type and job_bt:
                    if w_block_type == "TRAFFIC" and job_bt != "TRAFFIC":
                        model.Add(x[(jid, wid)] == 0)  # POWER work under TRAFFIC-only block
                        continue
                    if w_block_type == "POWER" and job_bt not in ("POWER", "POWER_AND_TRAFFIC"):
                        model.Add(x[(jid, wid)] == 0)
                        continue
                # 3c. Power isolation capability
                allows_power = bool(window.get("allowsPowerIsolation") or window.get("allows_power_isolation"))
                if needs_power[jid] and not allows_power:
                    model.Add(x[(jid, wid)] == 0)
                    continue

                # 3d. Possession fits window capacity
                if possession[jid] > (w_end - w_start):
                    model.Add(x[(jid, wid)] == 0)
                    continue

                # 3e. Train protection: job interval must fit one safe gap
                movements = train_movements or []
                if movements:
                    gaps, _hits = train_protection_gaps(window, movements, _window_corridor(window))
                    gap_starts = [g[0] for g in gaps]
                    gap_ends = [g[1] for g in gaps]
                    # start must fall inside a gap long enough for the job
                    if gaps:
                        # build a boolean per gap: job starts within this gap
                        gap_ok = []
                        for g_start, g_end in gaps:
                            fits = possession[jid] <= (g_end - g_start)
                            b = model.NewBoolVar(f"gap_{jid}_{wid}_{g_start}")
                            model.Add(start[(jid, wid)] >= g_start).OnlyEnforceIf(b)
                            model.Add(start[(jid, wid)] + possession[jid] <= g_end).OnlyEnforceIf(b)
                            if fits:
                                gap_ok.append(b)
                            else:
                                model.Add(b == 0)
                        if gap_ok:
                            model.Add(sum(gap_ok) >= 1).OnlyEnforceIf(x[(jid, wid)])
                        else:
                            model.Add(x[(jid, wid)] == 0)

        # ---------------------------------------------------------------
        # 4. Pairwise interval logic (parallel / conditional / resources)
        # ---------------------------------------------------------------
        # There is NO blanket NoOverlap: jobs may overlap in time only when
        # the compatibility layer marks the pair COMPATIBLE with PARALLEL
        # execution. Everything else is pairwise and interval-exact:
        #   • INCOMPATIBLE pairs never share a window;
        #   • CONDITIONAL pairs obey `first.end + handover <= second.start`
        #     whenever both are assigned to the same window (proper
        #     reification: enforced by the two assignment literals themselves,
        #     never by a free Boolean the solver could set false);
        #   • shared resources forbid overlapping JOB intervals (window
        #     overlap alone is NOT a conflict);
        #   • all other co-window pairs run strictly sequentially (safe
        #     default inside one possession).
        parallel_allowed: Set[Tuple[str, str]] = set()
        incompatible_pairs: Set[Tuple[str, str]] = set()
        conditional_orders: Dict[Tuple[str, str], int] = {}
        for group in compat_groups or []:
            status = str(group.get("status") or group.get("compatibility") or "").upper()
            members = [str(m) for m in (group.get("jobIds") or group.get("job_ids") or [])]
            if len(members) < 2:
                continue
            if status == "INCOMPATIBLE":
                for i in range(len(members)):
                    for k in range(i + 1, len(members)):
                        a, b = members[i], members[k]
                        if a in job_ids and b in job_ids:
                            incompatible_pairs.add((a, b))
                            incompatible_pairs.add((b, a))
            elif status == "COMPATIBLE":
                execution = str(group.get("execution") or "PARALLEL").upper()
                if execution == "PARALLEL":
                    for i in range(len(members)):
                        for k in range(i + 1, len(members)):
                            a, b = members[i], members[k]
                            if a in job_ids and b in job_ids:
                                parallel_allowed.add((a, b))
                                parallel_allowed.add((b, a))
            elif status == "CONDITIONAL":
                first = str(group.get("before") or group.get("first") or members[0])
                second = str(group.get("after") or group.get("second") or members[-1])
                if first in job_ids and second in job_ids:
                    conditional_orders[(first, second)] = int(group.get("handover_minutes") or 0)

        def _add_sequence_disjunction(j1: str, j2: str, wid1: str, wid2: str) -> None:
            """When both are assigned, one job interval must precede the other.

            The disjunction is enforced by the assignment literals themselves
            (`OnlyEnforceIf([x1, x2])`), so it activates exactly when both are
            scheduled and can never be switched off by an unrelated Boolean.
            """
            o_ab = model.NewBoolVar(f"seq_{j1}_{j2}_{wid1}_{wid2}_ab")
            o_ba = model.NewBoolVar(f"seq_{j1}_{j2}_{wid1}_{wid2}_ba")
            model.Add(start[(j1, wid1)] + possession[j1] <= start[(j2, wid2)]).OnlyEnforceIf(o_ab)
            model.Add(start[(j2, wid2)] + possession[j2] <= start[(j1, wid1)]).OnlyEnforceIf(o_ba)
            model.AddBoolOr([o_ab, o_ba]).OnlyEnforceIf([x[(j1, wid1)], x[(j2, wid2)]])

        for i in range(len(job_ids)):
            for j2 in job_ids[i + 1 :]:
                j1 = job_ids[i]
                shared = set(resources_of[j1]) & set(resources_of[j2])

                # Incompatible pairs never share a window at all.
                if (j1, j2) in incompatible_pairs:
                    for wid in window_ids:
                        model.Add(x[(j1, wid)] + x[(j2, wid)] <= 1)
                    continue

                for wid1 in window_ids:
                    for wid2 in window_ids:
                        if wid1 == wid2:
                            # Conditional ordering: mandatory whenever both sit
                            # in this window — no escape Boolean (Phase 3).
                            if (j1, j2) in conditional_orders:
                                handover = conditional_orders[(j1, j2)]
                                model.Add(
                                    end[(j1, wid1)] + handover <= start[(j2, wid1)]
                                ).OnlyEnforceIf([x[(j1, wid1)], x[(j2, wid1)]])
                                continue
                            # Explicit parallel-compatible pair with no shared
                            # resource: genuine simultaneous work is allowed.
                            if (j1, j2) in parallel_allowed and not shared:
                                continue
                            # Default sequential execution inside one possession
                            # (also covers parallel pairs that share a resource —
                            # even compatible work cannot double-book a machine).
                            _add_sequence_disjunction(j1, j2, wid1, wid1)
                        elif shared:
                            # Shared resource across DIFFERENT windows: window
                            # overlap alone is NOT the test — the JOB intervals
                            # must be disjoint when both are assigned (Phase 4).
                            _add_sequence_disjunction(j1, j2, wid1, wid2)

        # ---------------------------------------------------------------
        # 6. Locked assignments — pinned, never silently moved
        # ---------------------------------------------------------------
        for jid, locked_wid in (locked_assignments or {}).items():
            if jid not in job_ids:
                continue
            if locked_wid not in window_ids:
                locked_conflicts.append(
                    f"LOCKED_ASSIGNMENT_CONFLICT: job {jid} locked to window '{locked_wid}' which no longer exists."
                )
                continue
            model.Add(x[(jid, locked_wid)] == 1)
            model.Add(defer[jid] == 0)
            # A locked job must still be feasible — if every hard filter above
            # zeroed x[(jid, locked_wid)], the model becomes INFEASIBLE and the
            # planner reports LOCKED_ASSIGNMENT_CONFLICT honestly.

        # ---------------------------------------------------------------
        # 7. Objective (configurable weights; not exposed as AI scores)
        # ---------------------------------------------------------------
        matrix = self.objective_builder.build_matrix(
            list(job_map.values()),
            list(window_map.values()),
            department_fairness=department_fairness,
        )
        job_coeffs = matrix["job_coefficients"]
        window_rewards = matrix["window_rewards"]

        objective_terms: List[Any] = []
        for jid in job_ids:
            for wid in window_ids:
                reward = window_rewards[jid][wid]
                objective_terms.append(reward * x[(jid, wid)])
            defer_cost = job_coeffs[jid].deferral_penalty
            if defer_cost > 0:
                objective_terms.append(-defer_cost * defer[jid])

        model.Maximize(sum(objective_terms))

        # ---------------------------------------------------------------
        # 8. Solve deterministically (single worker, fixed seed)
        # ---------------------------------------------------------------
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.max_time_in_seconds
        solver.parameters.random_seed = self.deterministic_seed
        solver.parameters.num_workers = 1

        status_code = solver.Solve(model)

        if status_code == cp_model.OPTIMAL:
            status_str = "OPTIMAL"
        elif status_code == cp_model.FEASIBLE:
            status_str = "FEASIBLE"
        elif status_code == cp_model.INFEASIBLE:
            status_str = "INFEASIBLE"
        elif status_code == cp_model.MODEL_INVALID:
            status_str = "MODEL_INVALID"
        else:
            status_str = "UNKNOWN"

        assigned_jobs: List[Dict[str, Any]] = []
        deferred_ids: List[str] = []

        if status_str in ("OPTIMAL", "FEASIBLE"):
            for jid in job_ids:
                placed = False
                for wid in window_ids:
                    if solver.Value(x[(jid, wid)]) == 1:
                        s = solver.Value(start[(jid, wid)])
                        e = solver.Value(end[(jid, wid)])
                        window = window_map[wid]
                        assigned_jobs.append(
                            {
                                "jobId": jid,
                                "windowId": wid,
                                "start": format_minute_of_day(s),
                                "end": format_minute_of_day(e),
                                "start_minutes": s,
                                "end_minutes": e,
                                "parallel": bool(
                                    any(
                                        solver.Value(x[(other, wid)]) == 1
                                        for other in job_ids
                                        if other != jid
                                        and (jid, other) in parallel_allowed
                                    )
                                ),
                                "possession_minutes": possession[jid],
                                "note": f"Scheduled in {wid} ({_window_corridor(window)})",
                                "resources": list(resources_of[jid]),
                            }
                        )
                        placed = True
                        break
                if not placed:
                    deferred_ids.append(jid)
        else:
            deferred_ids = list(job_ids)

        return OptimizerSolution(
            status=status_str,
            assigned_jobs=assigned_jobs,
            deferred_job_ids=deferred_ids,
            objective_value=float(solver.ObjectiveValue()) if status_str in ("OPTIMAL", "FEASIBLE") else 0.0,
            solve_time_seconds=round(solver.WallTime(), 3),
            statistics={
                "branches": solver.NumBranches(),
                "conflicts": solver.NumConflicts(),
            },
            locked_conflicts=locked_conflicts,
        )
