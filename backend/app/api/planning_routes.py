"""Planning, simulation, evaluation and governance routes.

Every endpoint answers in the single canonical envelope
``{status, generated_at, payload, data_quality, errors}``.

This router is included by ``backend.app.api.app`` — the ONE primary
FastAPI application. The legacy zero-dependency server was retired; the
frontend consumes only these canonical endpoints.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Query, Request
from pydantic import BaseModel, Field

from backend.app.schemas import ApiEnvelope, ValidationMessage
from backend.app.services.governance import get_plan_store
from backend.app.services.planning import replan as run_replan
from backend.app.services.planning import run_plan
from backend.app.services.reason_codes import reason_code_catalogue
from backend.app.services.scenarios import ScenarioEngine
from backend.app.services.timeline import format_minute_of_day

router = APIRouter()


def get_domain(request: Request):
    return request.app.state.domain


def _envelope(status: str, payload: Dict[str, Any], **errors) -> ApiEnvelope:
    return ApiEnvelope(status=status, payload=payload, **errors)


def _error(code: str, message: str) -> ApiEnvelope:
    return ApiEnvelope(
        status="ERROR",
        payload={},
        errors=[ValidationMessage(code=code, severity="ERROR", message=message)],
    )


# ---------------------------------------------------------------------------
# Planners
# ---------------------------------------------------------------------------


class PlannerRunRequest(BaseModel):
    """Request for POST /api/planner/run."""

    plan_date: Optional[str] = None
    mode: str = "BALANCED"
    corridor_ids: List[str] = Field(default_factory=list)
    job_ids: List[str] = Field(default_factory=list)
    include_review_required: bool = True


@router.post("/planner/run", response_model=ApiEnvelope)
def planner_run(request: Request, body: PlannerRunRequest | None = None) -> ApiEnvelope:
    """Run the real CP-SAT planner over the canonical world."""
    body = body or PlannerRunRequest()
    try:
        result = run_plan(
            mode=body.mode,
            corridor_ids=body.corridor_ids or None,
            job_ids=body.job_ids or None,
            include_review_required=body.include_review_required,
        )
    except Exception as exc:  # never leak a traceback to the demo UI
        return _error("PLANNER_FAILED", f"Planner failed: {exc}")
    status = "READY" if result.get("status") in ("OPTIMAL", "FEASIBLE") else "REVIEW_REQUIRED"
    return _envelope(status, result)


@router.post("/planner/alternatives", response_model=ApiEnvelope)
def planner_alternatives(request: Request) -> ApiEnvelope:
    """Feature 18 — the SAME canonical world solved under all three objective
    profiles (SAFETY_FIRST / BALANCED / PUNCTUALITY_FIRST). Factual results
    only; the UI must not declare a winner."""
    from backend.app.services.ingestion import IngestionService
    from backend.app.services.objective import OptimizationMode
    from backend.app.services.optimizer import CpSatOptimizer
    from backend.app.services.bridge import CanonicalBridge
    from backend.app.services.planning import compat_groups_for_optimizer
    from backend.app.services.replanning import ReplanningEngine

    try:
        world = IngestionService().ingest()
        bridge = CanonicalBridge(
            world.jobs, world.blocks, world.trains, world.resources, world.sections
        )
        alternatives = ReplanningEngine.generate_alternatives(
            jobs=bridge.optimizer_jobs(),
            windows=bridge.optimizer_windows(),
            compat_groups=compat_groups_for_optimizer(bridge),
            train_movements=bridge.optimizer_trains(),
        )
    except Exception as exc:  # never leak a traceback to the demo UI
        return _error("ALTERNATIVES_FAILED", f"Alternatives failed: {exc}")
    comparison = {
        mode.value if hasattr(mode, "value") else str(mode): {
            "status": res.get("status"),
            "scheduled": res.get("metrics", {}).get("scheduled"),
            "deferred": res.get("metrics", {}).get("deferred"),
            "utilization": res.get("metrics", {}).get("utilization"),
            "train_impact_count": len(res.get("train_impacts", []) or []),
        }
        for mode, res in alternatives.items()
    }
    return _envelope("READY", {"alternatives": alternatives, "comparison": comparison})


class ReplanRequest(BaseModel):
    """Request for POST /api/replan."""

    event: Dict[str, Any]
    current_plan: Optional[Dict[str, Any]] = None
    locked_assignments: Dict[str, str] = Field(default_factory=dict)
    mode: str = "BALANCED"


@router.post("/replan", response_model=ApiEnvelope)
def replan_endpoint(request: Request, body: ReplanRequest) -> ApiEnvelope:
    """Event-driven replanning: current plan + event -> CP-SAT -> new plan."""
    from backend.app.services.replanning import EventType

    if not body.event.get("type"):
        return _error("EVENT_TYPE_REQUIRED", "event.type is required (e.g. SPECIAL_TRAIN).")
    raw_type = str(body.event.get("type") or "").strip().upper()
    if raw_type not in EventType.__members__:
        # An unknown trigger must NOT burn a plan version in the audit trail.
        return _error(
            "UNKNOWN_EVENT_TYPE",
            f"Unknown event type '{raw_type}'. Valid types: {', '.join(EventType.__members__)}.",
        )
    current_plan = body.current_plan
    if current_plan is None:
        # fall back to the most recent stored plan
        stored = get_plan_store().get_plan_or_default()
        current_plan = stored["plan"] if stored else None
    if current_plan is None:
        current_plan = run_plan(store=False)
    try:
        result = run_replan(
            current_plan=current_plan,
            event=body.event,
            locked_assignments=body.locked_assignments or None,
            mode=body.mode,
        )
    except Exception as exc:
        return _error("REPLAN_FAILED", f"Replanning failed: {exc}")
    status = "READY" if result.get("status") in ("OPTIMAL", "FEASIBLE") else "REVIEW_REQUIRED"
    return _envelope(status, result)


# ---------------------------------------------------------------------------
# Scenarios & evaluation
# ---------------------------------------------------------------------------


@router.get("/scenarios", response_model=ApiEnvelope)
def scenarios(request: Request) -> ApiEnvelope:
    return _envelope("READY", {"scenarios": ScenarioEngine.list_scenarios()})


class ScenarioRunRequest(BaseModel):
    scenario_id: str = "normal"


@router.post("/scenarios/run", response_model=ApiEnvelope)
def scenarios_run(request: Request, body: ScenarioRunRequest) -> ApiEnvelope:
    try:
        result = ScenarioEngine.run_scenario(body.scenario_id)
    except ValueError as exc:
        return _error("UNKNOWN_SCENARIO", str(exc))
    status = "READY" if result.get("status") in ("OPTIMAL", "FEASIBLE") else "REVIEW_REQUIRED"
    if result.get("status") == "INFEASIBLE":
        status = "REVIEW_REQUIRED"
    return _envelope(status, result)


class EvaluateRequest(BaseModel):
    scenario_id: str = "normal"
    modes: List[str] = Field(default_factory=lambda: ["EARLIEST_AVAILABLE", "GREEDY_PRIORITY", "CP_SAT"])


@router.post("/evaluate", response_model=ApiEnvelope)
def evaluate(request: Request, body: EvaluateRequest) -> ApiEnvelope:
    """Baseline comparison — identical inputs, factual metrics, no winner."""
    from backend.app.services.evaluation import EvaluationEngine, EvaluationMode

    unknown = [m for m in body.modes if str(m).upper() not in EvaluationMode.__members__]
    if unknown:
        return _error(
            "UNKNOWN_MODE",
            f"Unknown evaluation mode(s): {', '.join(unknown)}. "
            f"Valid modes: {', '.join(EvaluationMode.__members__)}.",
        )
    try:
        result = EvaluationEngine.evaluate(
            scenario_id=body.scenario_id,
            modes=[str(m).upper() for m in body.modes],
        )
    except ValueError as exc:
        return _error("UNKNOWN_SCENARIO", str(exc))
    return _envelope("READY", result)


# ---------------------------------------------------------------------------
# Block clearance
# ---------------------------------------------------------------------------


class BlockClearanceRequest(BaseModel):
    job_id: str
    block_id: str


@router.post("/block-clearance/check", response_model=ApiEnvelope)
def block_clearance(request: Request, body: BlockClearanceRequest) -> ApiEnvelope:
    """Rule-engine block clearance for (job, block) — no business logic here."""
    domain = get_domain(request)
    envelope = domain.block_clearance(job_id=body.job_id, block_id=body.block_id)
    return envelope


# ---------------------------------------------------------------------------
# Governance — approval lifecycle, staleness, audit
# ---------------------------------------------------------------------------


class GovernanceActionRequest(BaseModel):
    action: str = ""  # APPROVE | MODIFY | REJECT | LOCK
    officer: str
    reason: str = ""
    affected_jobs: List[str] = Field(default_factory=list)
    modified_plan: Optional[Dict[str, Any]] = None


@router.post("/plans/{plan_id}/approve", response_model=ApiEnvelope)
def approve_plan(plan_id: str, body: GovernanceActionRequest) -> ApiEnvelope:
    return _govern(plan_id, "APPROVE", body)


@router.post("/plans/{plan_id}/modify", response_model=ApiEnvelope)
def modify_plan(plan_id: str, body: GovernanceActionRequest) -> ApiEnvelope:
    return _govern(plan_id, "MODIFY", body)


@router.post("/plans/{plan_id}/reject", response_model=ApiEnvelope)
def reject_plan(plan_id: str, body: GovernanceActionRequest) -> ApiEnvelope:
    return _govern(plan_id, "REJECT", body)


@router.post("/plans/{plan_id}/lock", response_model=ApiEnvelope)
def lock_plan(plan_id: str, body: GovernanceActionRequest) -> ApiEnvelope:
    return _govern(plan_id, "LOCK", body)


def _govern(plan_id: str, action: str, body: GovernanceActionRequest) -> ApiEnvelope:
    store = get_plan_store()
    if not body.officer:
        return _error("OFFICER_REQUIRED", "An officer name is required for governance actions.")
    try:
        result = store.act(
            plan_id,
            action,
            officer=body.officer,
            reason=body.reason,
            affected_jobs=body.affected_jobs,
            modified_plan=body.modified_plan,
        )
    except KeyError as exc:
        return _error("PLAN_NOT_FOUND", str(exc))
    except ValueError as exc:
        return _error("TRANSITION_INVALID", str(exc))
    return _envelope("READY", result)


@router.get("/plans", response_model=ApiEnvelope)
def list_plans() -> ApiEnvelope:
    """List all stored plans and their revision history."""
    store = get_plan_store()
    plans = store.list_plans()
    if not plans:
        run_plan(store=True)
        plans = store.list_plans()
    return _envelope("READY", {"plans": plans, "count": len(plans)})


@router.post("/plans/generate", response_model=ApiEnvelope)
def plans_generate(request: Request, body: PlannerRunRequest | None = None) -> ApiEnvelope:
    """Canonical alias for generating a plan revision via CP-SAT planner."""
    return planner_run(request, body)


class PlanSimulateRequest(BaseModel):
    block_id: str = "W1"
    event: Dict[str, Any]


@router.post("/plans/{plan_id}/simulate", response_model=ApiEnvelope)
def plan_simulate(plan_id: str, body: PlanSimulateRequest) -> ApiEnvelope:
    """Run hypothetical simulation on an existing plan without mutating the active plan."""
    from backend.app.services.replanning import EventType

    store = get_plan_store()
    stored = store.get_plan(plan_id)
    if stored is None:
        stored = store.get_plan_or_default()
    if stored is None:
        run_plan(store=True)
        stored = store.get_plan_or_default()

    baseline_plan = stored["plan"] if stored else {}

    raw_event_type = str(body.event.get("type") or "").strip().upper()
    event_mapping = {
        "SPECIAL_TRAIN": "SPECIAL_TRAIN",
        "REDUCE_WINDOW": "WINDOW_REDUCED",
        "REDUCE_BLOCK_WINDOW": "WINDOW_REDUCED",
        "WINDOW_REDUCED": "WINDOW_REDUCED",
        "REMOVE_BLOCK": "WINDOW_WITHDRAWN",
        "WINDOW_WITHDRAWN": "WINDOW_WITHDRAWN",
        "EMERGENCY_JOB": "EMERGENCY_JOB",
        "RESOURCE_UNAVAILABLE": "RESOURCE_FAILURE",
        "RESOURCE_FAILURE": "RESOURCE_FAILURE",
        "PRIORITY_CHANGE": "PRIORITY_CHANGE",
        "OPERATIONAL_RESTRICTION": "OPERATIONAL_RESTRICTION",
    }
    canonical_event_type = event_mapping.get(raw_event_type, raw_event_type)
    if canonical_event_type not in EventType.__members__:
        return _error(
            "UNKNOWN_EVENT_TYPE",
            f"Unknown event type '{raw_event_type}'. Valid types: {', '.join(EventType.__members__)}.",
        )

    event_payload = dict(body.event.get("parameters") or body.event.get("payload") or {})
    event_payload["block_id"] = body.block_id
    if canonical_event_type == "WINDOW_REDUCED" and "windowId" not in event_payload:
        event_payload["windowId"] = body.block_id
        if "minutes" not in event_payload:
            event_payload["minutes"] = 60
    if canonical_event_type == "WINDOW_WITHDRAWN" and "windowId" not in event_payload:
        event_payload["windowId"] = body.block_id
    if canonical_event_type == "SPECIAL_TRAIN" and "train" not in event_payload:
        event_payload["train"] = {
            "id": event_payload.get("trainId", "00214"),
            "number": event_payload.get("trainNumber", "00214"),
            "start": event_payload.get("timeStart", "02:30"),
            "end": event_payload.get("timeEnd", "03:30"),
            "isProtected": True,
            "corridorId": event_payload.get("corridorId", "C1"),
        }

    sim_event = {
        "type": canonical_event_type,
        "payload": event_payload,
    }

    try:
        replan_result = run_replan(
            current_plan=baseline_plan,
            event=sim_event,
            store=False,
        )
    except Exception as exc:
        return _error("SIMULATION_FAILED", f"Simulation failed: {exc}")

    status = "FEASIBLE" if replan_result.get("status") in ("OPTIMAL", "FEASIBLE") else "INFEASIBLE"

    changes = []
    for item in replan_result.get("changed_assignments", []):
        changes.append({
            "type": "MOVED",
            "job_id": item.get("job_id"),
            "window": item.get("window"),
            "start": item.get("start"),
            "end": item.get("end"),
        })
    for item in replan_result.get("newly_deferred_jobs", []):
        changes.append({
            "type": "DEFERRED",
            "job_id": item.get("job_id"),
            "reason": item.get("reason", "Displaced by operational event"),
        })
    for item in replan_result.get("newly_scheduled_jobs", []):
        changes.append({
            "type": "SCHEDULED",
            "job_id": item.get("job_id"),
            "window": item.get("window"),
        })

    alternatives = [
        {"mode": "BALANCED", "description": "Balanced compromise between safety and punctuality"},
        {"mode": "SAFETY_FIRST", "description": "Prioritise critical maintenance; accept higher passenger delay"},
        {"mode": "PUNCTUALITY_FIRST", "description": "Protect train paths; defer non-urgent maintenance"},
    ]

    response_payload = {
        "status": status,
        "block_id": body.block_id,
        "baseline": baseline_plan,
        "event": {
            "type": canonical_event_type,
            "parameters": event_payload,
        },
        "simulated": replan_result,
        "changes": changes,
        "reasons": replan_result.get("reason_codes", []),
        "alternatives": alternatives,
        "metrics": replan_result.get("metrics", {}),
    }

    return _envelope("READY", response_payload)


@router.get("/plans/{plan_id}", response_model=ApiEnvelope)
def get_plan(plan_id: str) -> ApiEnvelope:
    stored = get_plan_store().get_plan(plan_id)
    if stored is None:
        stored = get_plan_store().get_plan_or_default()
    if stored is None:
        return _error("PLAN_NOT_FOUND", f"No plan '{plan_id}' stored yet — run POST /api/planner/run.")
    return _envelope("READY", stored)


@router.get("/plans/{plan_id}/audit", response_model=ApiEnvelope)
def plan_audit(plan_id: str) -> ApiEnvelope:
    store = get_plan_store()
    stored = store.get_plan(plan_id)
    resolved = plan_id
    if stored is None:
        default = store.get_plan_or_default()
        resolved = default["plan_id"] if default else plan_id
    history = store.audit_history(resolved)
    return _envelope("READY", {"plan_id": resolved, "audit": history, "count": len(history)})


@router.get("/audit", response_model=ApiEnvelope)
def all_audit() -> ApiEnvelope:
    history = get_plan_store().audit_history()
    return _envelope("READY", {"audit": history, "count": len(history)})


class StalenessRequest(BaseModel):
    pass


@router.post("/plans/{plan_id}/staleness", response_model=ApiEnvelope)
def plan_staleness(plan_id: str, request: Request) -> ApiEnvelope:
    """Compare the stored snapshot against the current canonical world."""
    domain = get_domain(request)
    current_world = domain.world_snapshot()
    store = get_plan_store()
    try:
        result = store.compute_staleness(plan_id, current_world)
    except KeyError as exc:
        return _error("PLAN_NOT_FOUND", str(exc))
    return _envelope("READY" if not result["stale"] else "REVIEW_REQUIRED", result)


# ---------------------------------------------------------------------------
# Reference
# ---------------------------------------------------------------------------


@router.get("/reason-codes/planning", response_model=ApiEnvelope)
def planning_reason_codes() -> ApiEnvelope:
    """Planning-side reason codes (train/resource/deferral explanations)."""
    return _envelope("READY", {"reason_codes": reason_code_catalogue()})
