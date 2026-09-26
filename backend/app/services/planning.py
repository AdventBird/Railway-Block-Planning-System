"""Planning facade — ONE call from canonical world to governed plan.

``run_plan`` is the single production entry point used by
POST /api/planner/run and POST /api/replan flows: it loads the canonical
world, projects it through the bridge, solves with CP-SAT, and stores the
result in the governance plan store.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.app.schemas import DataQualityStatus
from backend.app.services.bridge import CanonicalBridge
from backend.app.services.governance import get_plan_store
from backend.app.services.ingestion import IngestionResult
from backend.app.services.planner import Planner, PlannerResult
from backend.app.services.replanning import ReplanningEngine


def world_from_ingestion(result: IngestionResult) -> CanonicalBridge:
    """Canonical ingestion result → optimizer-facing bridge (one projection)."""
    return CanonicalBridge(
        jobs=result.jobs,
        blocks=result.blocks,
        trains=result.trains,
        resources=result.resources,
        sections=result.sections,
    )


def compat_groups_for_optimizer(bridge: CanonicalBridge) -> List[Dict[str, Any]]:
    """Rule-engine verdicts → optimizer compatibility groups (Phase 2/3/15).

    The rule engine and the optimizer can never disagree: every pairwise
    COMPATIBLE / CONDITIONAL / INCOMPATIBLE verdict from the configuration-
    driven CompatibilityEngine becomes a hard CP-SAT constraint group.
    """
    from backend.app.rules.compatibility import CompatibilityEngine

    engine = CompatibilityEngine()
    groups: List[Dict[str, Any]] = []
    for verdict in engine.check_all(bridge.jobs):
        status = str(
            verdict.compatibility.value
            if hasattr(verdict.compatibility, "value")
            else verdict.compatibility
        ).upper()
        group: Dict[str, Any] = {
            "id": f"CG-{verdict.job_a}-{verdict.job_b}",
            "status": status,
            "jobIds": [verdict.job_a, verdict.job_b],
        }
        if status == "CONDITIONAL":
            group["before"] = verdict.job_a
            group["after"] = verdict.job_b
            group["handover_minutes"] = verdict.setup_handover_minutes
        elif status == "COMPATIBLE":
            execution = str(
                verdict.execution.value
                if hasattr(verdict.execution, "value")
                else verdict.execution
            ).upper()
            group["execution"] = execution
        groups.append(group)
    return groups


def run_plan(
    world: Optional[IngestionResult] = None,
    plan_version: str = "r1",
    mode: str = "BALANCED",
    include_review_required: bool = True,
    store: bool = True,
    corridor_ids: Optional[List[str]] = None,
    job_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Plan tonight from the canonical world.

    Returns the planner result dict with ``status`` in
    OPTIMAL / FEASIBLE / INFEASIBLE and assignments carrying real
    start/end intervals.
    """
    from backend.app.services.ingestion import IngestionService
    from backend.app.services.objective import ObjectiveBuilder

    if world is None:
        world = IngestionService().ingest()
    bridge = CanonicalBridge(
        world.jobs,
        world.blocks,
        world.trains,
        world.resources,
        world.sections,
        include_review_required=include_review_required,
    )

    jobs = bridge.optimizer_jobs()
    if corridor_ids:
        jobs = [j for j in jobs if j["corridor_id"] in corridor_ids]
    if job_ids:
        wanted = set(job_ids)
        jobs = [j for j in jobs if j["id"] in wanted]

    windows = bridge.optimizer_windows()
    trains = bridge.optimizer_trains()
    compat_groups = compat_groups_for_optimizer(bridge)

    planner = Planner(
        objective_builder=ObjectiveBuilder.from_mode(mode),
        plan_version=plan_version,
    )
    result = planner.solve(
        jobs=jobs,
        windows=windows,
        compat_groups=compat_groups,
        train_movements=trains,
    )
    out = result.to_dict()
    out["generated_at_world"] = {
        "jobs": len(jobs),
        "windows": len(windows),
        "protected_trains": sum(1 for t in trains if t.get("isProtected")),
    }
    out["mode"] = mode

    if store:
        store_handle = get_plan_store()
        snapshot = {
            "jobs": [
                {
                    "job_id": j.job_id,
                    "severity": j.severity,
                    "tier": j.tier,
                    "deadline": j.deadline.isoformat() if j.deadline else None,
                    "status": j.status,
                    "required_resources": list(j.required_resources),
                    "power_isolation_required": j.power_isolation_required,
                }
                for j in bridge.jobs
            ]
        }
        plan_id = f"PLAN-{plan_version}"
        existing = store_handle.get_plan(plan_id)
        if existing is None:
            store_handle.save_plan(out, plan_id=plan_id, snapshot=snapshot, officer="planner")
    return out


def replan(
    current_plan: Dict[str, Any],
    event: Dict[str, Any],
    locked_assignments: Optional[Dict[str, str]] = None,
    world: Optional[IngestionResult] = None,
    mode: str = "BALANCED",
    store: bool = True,
) -> Dict[str, Any]:
    """Event-driven replanning against the canonical world (one path)."""
    from backend.app.services.ingestion import IngestionService
    from backend.app.services.objective import ObjectiveBuilder

    # Phase 10: production calls (world=None) persist the new version; tests
    # pass an explicit world (or store=False) to stay isolated.
    world_was_provided = world is not None
    if world is None:
        world = IngestionService().ingest()
    bridge = CanonicalBridge(
        world.jobs,
        world.blocks,
        world.trains,
        world.resources,
        world.sections,
    )
    jobs = bridge.optimizer_jobs()
    windows = bridge.optimizer_windows()
    trains = bridge.optimizer_trains()
    compat_groups = compat_groups_for_optimizer(bridge)

    old_version = str(current_plan.get("plan_version") or current_plan.get("version") or "r1")

    result = ReplanningEngine.replan(
        current_plan=current_plan,
        current_jobs=jobs,
        windows=windows,
        event=event,
        train_movements=trains,
        compat_groups=compat_groups,
        locked_assignments=locked_assignments,
        mode=mode,
    )
    out = result.to_dict()

    # Phase 10 — every production replan result is persisted as a real version
    # (PLAN-rN). Replanning from r1 stores PLAN-r2; governance MODIFY bumps
    # rN → rN+1. Tests pass an explicit world to stay isolated.
    if not world_was_provided and store:
        from backend.app.services.governance import get_plan_store

        snapshot = {
            "jobs": [
                {
                    "job_id": j.job_id,
                    "severity": j.severity,
                    "tier": j.tier,
                    "deadline": j.deadline.isoformat() if j.deadline else None,
                    "status": j.status,
                    "required_resources": list(j.required_resources),
                    "power_isolation_required": j.power_isolation_required,
                }
                for j in bridge.jobs
            ]
        }
        store_handle = get_plan_store()
        plan_id = f"PLAN-{out.get('plan_version', 'r2')}"
        store_handle.save_plan(
            out,
            plan_id=plan_id,
            snapshot=snapshot,
            officer="replanner",
            event_trigger=str(out.get("trigger") or ""),
        )
    return out
