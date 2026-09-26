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


class ReplanRequest(BaseModel):
    """Request for POST /api/replan."""

    event: Dict[str, Any]
    current_plan: Optional[Dict[str, Any]] = None
    locked_assignments: Dict[str, str] = Field(default_factory=dict)
    mode: str = "BALANCED"


@router.post("/replan", response_model=ApiEnvelope)
def replan_endpoint(request: Request, body: ReplanRequest) -> ApiEnvelope:
    """Event-driven replanning: current plan + event -> CP-SAT -> new plan."""
    if not body.event.get("type"):
        return _error("EVENT_TYPE_REQUIRED", "event.type is required (e.g. SPECIAL_TRAIN).")
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
    from backend.app.services.evaluation import EvaluationEngine

    try:
        result = EvaluationEngine.evaluate(
            scenario_id=body.scenario_id,
            modes=body.modes,
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
    action: str  # APPROVE | MODIFY | REJECT | LOCK
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
