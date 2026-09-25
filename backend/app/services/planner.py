"""Planner Orchestrator Service for Railway Block Planning System.

Integrates:
- PriorityEngine (Phase 1)
- Constraint Foundation (Phase 2: FairnessEngine, BufferEngine, ResourceEngine)
- ObjectiveBuilder & CpSatOptimizer (Phase 3)
- DiagnosticsEngine (Phase 3)

Produces structured, deterministic, optimization-backed planner results.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Union

from backend.app.services.diagnostics import DiagnosticsEngine, JobDiagnostic
from backend.app.services.fairness import FairnessEngine
from backend.app.services.objective import ObjectiveBuilder
from backend.app.services.optimizer import CpSatOptimizer, OptimizerSolution
from backend.app.services.priority import MaintenanceJob, PriorityEngine


DEFAULT_PLAN_VERSION: str = "r1"


@dataclass
class PlannerResult:
    """Canonical result produced by the Railway Block Planner."""

    status: str  # "OPTIMAL" | "FEASIBLE" | "INFEASIBLE"
    plan_version: str
    assignments: List[Dict[str, Any]]
    deferred_jobs: List[Dict[str, Any]]
    metrics: Dict[str, Any]
    diagnostics: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary matching the frontend API contract and INFEASIBLE schema."""
        out: Dict[str, Any] = {
            "status": self.status,
            "plan_version": self.plan_version,
            "assignments": list(self.assignments),
            "deferred_jobs": list(self.deferred_jobs),
            "metrics": dict(self.metrics),
        }
        if self.diagnostics:
            out["diagnostics"] = self.diagnostics
            if "blocking_constraints" in self.diagnostics:
                out["blocking_constraints"] = self.diagnostics["blocking_constraints"]
            if "reason_codes" in self.diagnostics:
                out["reason_codes"] = self.diagnostics["reason_codes"]
            if "affected_jobs" in self.diagnostics:
                out["affected_jobs"] = self.diagnostics["affected_jobs"]
        return out


class Planner:
    """Core Railway Maintenance Block Planner."""

    def __init__(
        self,
        optimizer: Optional[CpSatOptimizer] = None,
        objective_builder: Optional[ObjectiveBuilder] = None,
        plan_version: str = DEFAULT_PLAN_VERSION,
    ) -> None:
        self.objective_builder = objective_builder or ObjectiveBuilder()
        self.optimizer = optimizer or CpSatOptimizer(objective_builder=self.objective_builder)
        self.plan_version = plan_version

    def solve(
        self,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        supported_departments: Optional[List[str]] = None,
    ) -> PlannerResult:
        """Run end-to-end planning optimization.

        Workflow:
        1. Prioritize and validate canonical jobs (PriorityEngine).
        2. Evaluate department backlogs and anti-starvation penalties (FairnessEngine).
        3. Optimize window assignments using Google OR-Tools CP-SAT (CpSatOptimizer).
        4. Diagnose deferred jobs and explain blocking constraints (DiagnosticsEngine).
        5. Generate derived planner arithmetic and metrics.
        """
        # 1. Prioritize input jobs (ensure tiers are assigned deterministically)
        ranked_jobs = PriorityEngine.rank_jobs(jobs)
        job_map = {
            str(PriorityEngine._extract_field(j, "id", "job_id", "jobId", default="")): j
            for j in ranked_jobs
        }

        # 2. Fairness & Anti-Starvation Backlog Summary
        fairness_summary = FairnessEngine.backlog_summary(
            ranked_jobs, supported_departments=supported_departments
        )

        # 3. Solve via CP-SAT Optimizer
        solution = self.optimizer.optimize(
            jobs=ranked_jobs,
            windows=windows,
            compat_groups=compat_groups,
            train_movements=train_movements,
            locked_assignments=locked_assignments,
            department_fairness=fairness_summary,
        )

        # Handle INFEASIBLE gracefully
        if solution.status == "INFEASIBLE":
            infeas_diag = DiagnosticsEngine.build_infeasible_result(
                jobs=ranked_jobs,
                candidate_windows=windows,
                locked_assignments=locked_assignments,
                train_movements=train_movements,
                compat_groups=compat_groups,
                plan_version=self.plan_version,
            )
            deferred_entries = []
            for j_id in job_map:
                diag = DiagnosticsEngine.diagnose_job(
                    job=job_map[j_id],
                    candidate_windows=windows,
                    scheduled_assignments=[],
                    compat_groups=compat_groups,
                    train_movements=train_movements,
                    locked_assignments=locked_assignments,
                )
                entry = diag.to_dict()
                entry["jobId"] = j_id
                entry["code"] = diag.reason_codes[0] if diag.reason_codes else "NO_FEASIBLE_WINDOW"
                entry["reason"] = diag.explanation
                deferred_entries.append(entry)

            return PlannerResult(
                status="INFEASIBLE",
                plan_version=self.plan_version,
                assignments=[],
                deferred_jobs=deferred_entries,
                metrics={
                    "jobs": len(job_map),
                    "scheduled": 0,
                    "deferred": len(job_map),
                    "utilization": 0.0,
                },
                diagnostics=infeas_diag,
            )

        # 4. Diagnose Deferred Jobs
        deferred_entries = []
        for def_id in solution.deferred_job_ids:
            if def_id in job_map:
                diag = DiagnosticsEngine.diagnose_job(
                    job=job_map[def_id],
                    candidate_windows=windows,
                    scheduled_assignments=solution.assigned_jobs,
                    compat_groups=compat_groups,
                    train_movements=train_movements,
                    locked_assignments=locked_assignments,
                )
                primary_code = diag.reason_codes[0] if diag.reason_codes else "LOWER_PRIORITY"
                deferred_entries.append({
                    "jobId": def_id,
                    "job_id": def_id,
                    "status": "DEFERRED",
                    "code": primary_code,
                    "reason": diag.explanation,
                    "reason_codes": diag.reason_codes,
                    "blocking_constraints": diag.blocking_constraints,
                })

        # 5. Calculate Metrics
        metrics = self.generate_metrics(
            jobs=ranked_jobs,
            windows=windows,
            assignments=solution.assigned_jobs,
            deferred=deferred_entries,
            train_movements=train_movements,
        )

        return PlannerResult(
            status=solution.status,
            plan_version=self.plan_version,
            assignments=solution.assigned_jobs,
            deferred_jobs=deferred_entries,
            metrics=metrics,
        )

    def generate_metrics(
        self,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        assignments: Sequence[Dict[str, Any]],
        deferred: Sequence[Dict[str, Any]],
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Compute structured metrics for the planning outcome."""
        total_jobs = len(jobs)
        scheduled_count = len(assignments)
        deferred_count = len(deferred)

        total_window_mins = sum(int(w.get("minutes") or 0) for w in windows)

        # Occupied minutes from assigned jobs
        occupied_mins = 0
        job_map = {
            str(PriorityEngine._extract_field(j, "id", "job_id", "jobId", default="")): j
            for j in jobs
        }
        for a in assignments:
            j_id = str(a.get("jobId") or a.get("job_id") or "")
            if j_id in job_map:
                duration = int(PriorityEngine._extract_field(job_map[j_id], "duration_minutes", "minutes", default=0))
                occupied_mins += duration

        utilization = round((occupied_mins / total_window_mins * 100.0), 1) if total_window_mins > 0 else 0.0

        # Unique windows utilized
        utilized_windows = len(set(str(a.get("windowId") or a.get("window_id") or "") for a in assignments))

        # Tier coverage
        tier_counts: Dict[str, int] = {}
        for a in assignments:
            j_id = str(a.get("jobId") or a.get("job_id") or "")
            if j_id in job_map:
                tier = PriorityEngine.assign_tier(job_map[j_id])
                tier_counts[str(tier)] = tier_counts.get(str(tier), 0) + 1

        # Train impact
        train_impact_list = []
        if train_movements:
            train_impact_list = [
                f"Path protected for {tr.get('name') or tr.get('number') or 'train'} on {tr.get('corridorId', '')}"
                for tr in train_movements if tr.get("isProtected", True)
            ]

        return {
            "jobs": total_jobs,
            "scheduled": scheduled_count,
            "deferred": deferred_count,
            "blocks": utilized_windows,
            "total_window_minutes": total_window_mins,
            "occupied_minutes": occupied_mins,
            "utilization": utilization,
            "tier_coverage": tier_counts,
            "train_impact": train_impact_list,
        }

    def generate_alternatives(
        self,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        supported_departments: Optional[List[str]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Generate three valid plan alternatives (SAFETY_FIRST, BALANCED, PUNCTUALITY_FIRST)."""
        from backend.app.services.replanning import ReplanningEngine

        return ReplanningEngine.generate_alternatives(
            jobs=jobs,
            windows=windows,
            compat_groups=compat_groups,
            train_movements=train_movements,
            locked_assignments=locked_assignments,
            supported_departments=supported_departments,
            plan_version=self.plan_version,
        )

    def replan(
        self,
        current_plan: Union[PlannerResult, Dict[str, Any]],
        current_jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        event: Union[Dict[str, Any], Any],
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        supported_departments: Optional[List[str]] = None,
        mode: str = "BALANCED",
    ) -> Any:
        """Run event-driven replanning responding to an operational trigger."""
        from backend.app.services.replanning import ReplanningEngine

        return ReplanningEngine.replan(
            current_plan=current_plan,
            current_jobs=current_jobs,
            windows=windows,
            event=event,
            train_movements=train_movements,
            compat_groups=compat_groups,
            locked_assignments=locked_assignments,
            supported_departments=supported_departments,
            mode=mode,
        )

    def emergency_insertion(
        self,
        current_plan: Union[PlannerResult, Dict[str, Any]],
        emergency_job: Union[MaintenanceJob, Dict[str, Any]],
        current_jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        target_window_id: Optional[str] = None,
    ) -> Any:
        """Execute dedicated emergency insertion workflow (Feature 20)."""
        from backend.app.services.replanning import ReplanningEngine

        return ReplanningEngine.emergency_insertion(
            current_plan=current_plan,
            emergency_job=emergency_job,
            current_jobs=current_jobs,
            windows=windows,
            train_movements=train_movements,
            compat_groups=compat_groups,
            locked_assignments=locked_assignments,
            target_window_id=target_window_id,
        )

    def evaluate(
        self,
        scenario_id: Optional[str] = None,
        modes: Optional[Sequence[str]] = None,
        jobs: Optional[Sequence[Union[MaintenanceJob, Dict[str, Any]]]] = None,
        windows: Optional[Sequence[Dict[str, Any]]] = None,
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        supported_departments: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Run baseline evaluation comparison across planning modes (Feature 28)."""
        from backend.app.services.evaluation import EvaluationEngine

        return EvaluationEngine.evaluate(
            scenario_id=scenario_id,
            modes=modes,
            jobs=jobs,
            windows=windows,
            compat_groups=compat_groups,
            train_movements=train_movements,
            locked_assignments=locked_assignments,
            supported_departments=supported_departments,
        )

    @classmethod
    def run_scenario(cls, scenario_id: str) -> Dict[str, Any]:
        """Execute a predefined demo scenario (Feature 30)."""
        from backend.app.services.scenarios import ScenarioEngine

        return ScenarioEngine.run_scenario(scenario_id)

