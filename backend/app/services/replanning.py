"""Dynamic Replanning Engine for Railway Block Planning.

Implements:
- Feature 18: Plan Alternatives (SAFETY_FIRST, BALANCED, PUNCTUALITY_FIRST)
- Feature 19: Event-Driven Replanning (SPECIAL_TRAIN, TRAIN_CANCELLED, RESOURCE_FAILURE,
  EMERGENCY_JOB, WINDOW_REDUCED, WINDOW_WITHDRAWN, PRIORITY_CHANGE, OPERATIONAL_RESTRICTION)
- Feature 20: Emergency Insertion (Tier 0 treatment, resource pre-emption, window protection)
- Versioning: r1 -> r2 -> r3 immutable version progression with before/after audit diffs
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple, Union

from backend.app.services.diagnostics import DiagnosticsEngine
from backend.app.services.objective import ObjectiveBuilder, OptimizationMode
from backend.app.services.optimizer import CpSatOptimizer
from backend.app.services.planner import Planner, PlannerResult
from backend.app.services.priority import MaintenanceJob, PriorityEngine, Tier


class EventType(str, Enum):
    """Supported operational replanning triggers."""

    SPECIAL_TRAIN = "SPECIAL_TRAIN"
    TRAIN_CANCELLED = "TRAIN_CANCELLED"
    RESOURCE_FAILURE = "RESOURCE_FAILURE"
    EMERGENCY_JOB = "EMERGENCY_JOB"
    WINDOW_REDUCED = "WINDOW_REDUCED"
    WINDOW_WITHDRAWN = "WINDOW_WITHDRAWN"
    PRIORITY_CHANGE = "PRIORITY_CHANGE"
    OPERATIONAL_RESTRICTION = "OPERATIONAL_RESTRICTION"


def increment_plan_version(current_version: str) -> str:
    """Generate next immutable plan version (e.g. 'r1' -> 'r2', 'v2026.09.15 · r1' -> 'v2026.09.15 · r2')."""
    match = re.search(r"r(\d+)", current_version)
    if match:
        current_rev = int(match.group(1))
        new_rev = current_rev + 1
        return re.sub(r"r\d+", f"r{new_rev}", current_version)
    return f"{current_version}.r2"


@dataclass
class ReplanningResult:
    """Structured response for event-driven replanning."""

    status: str
    plan_version: str
    trigger: str
    changed_assignments: List[Dict[str, Any]]
    unchanged_assignments: List[Dict[str, Any]]
    newly_deferred_jobs: List[Dict[str, Any]]
    newly_scheduled_jobs: List[Dict[str, Any]]
    metrics: Dict[str, Any]
    train_impacts: List[str]
    reason_codes: List[str]
    assignments: List[Dict[str, Any]] = field(default_factory=list)
    deferred_jobs: List[Dict[str, Any]] = field(default_factory=list)
    timestamp: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary matching the required API contract."""
        return {
            "status": self.status,
            "plan_version": self.plan_version,
            "trigger": self.trigger,
            "changed_assignments": list(self.changed_assignments),
            "unchanged_assignments": list(self.unchanged_assignments),
            "newly_deferred_jobs": list(self.newly_deferred_jobs),
            "newly_scheduled_jobs": list(self.newly_scheduled_jobs),
            "metrics": dict(self.metrics),
            "train_impacts": list(self.train_impacts),
            "reason_codes": list(self.reason_codes),
            "assignments": list(self.assignments),
            "deferred_jobs": list(self.deferred_jobs),
            "timestamp": self.timestamp,
        }


class ReplanningEngine:
    """Dynamic Event-Driven Replanning & Plan Alternatives Engine."""

    @classmethod
    def generate_alternatives(
        cls,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        supported_departments: Optional[List[str]] = None,
        plan_version: str = "r1",
    ) -> Dict[str, Dict[str, Any]]:
        """Generate three valid plan alternatives for the same scenario.

        - SAFETY_FIRST: Maximize safety-critical maintenance completion
        - BALANCED: Balanced maintenance + train impact
        - PUNCTUALITY_FIRST: Minimize operational disruption
        """
        results: Dict[str, Dict[str, Any]] = {}

        for mode in [OptimizationMode.SAFETY_FIRST, OptimizationMode.BALANCED, OptimizationMode.PUNCTUALITY_FIRST]:
            obj_builder = ObjectiveBuilder.from_mode(mode)
            optimizer = CpSatOptimizer(objective_builder=obj_builder)
            planner = Planner(optimizer=optimizer, objective_builder=obj_builder, plan_version=plan_version)

            plan_result = planner.solve(
                jobs=jobs,
                windows=windows,
                compat_groups=compat_groups,
                train_movements=train_movements,
                locked_assignments=locked_assignments,
                supported_departments=supported_departments,
            )

            res_dict = plan_result.to_dict()
            res_dict["mode"] = mode.value
            res_dict["train_impacts"] = res_dict["metrics"].get("train_impact", [])
            results[mode.value] = res_dict

        return results

    @classmethod
    def replan(
        cls,
        current_plan: Union[PlannerResult, Dict[str, Any]],
        current_jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        event: Union[Dict[str, Any], Any],
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        supported_departments: Optional[List[str]] = None,
        mode: Union[str, OptimizationMode] = OptimizationMode.BALANCED,
    ) -> ReplanningResult:
        """Execute event-driven replanning against an existing plan."""
        # 1. Parse current plan state
        if isinstance(current_plan, PlannerResult):
            c_dict = current_plan.to_dict()
        else:
            c_dict = dict(current_plan)

        old_version = c_dict.get("plan_version", "r1")
        new_version = increment_plan_version(old_version)
        old_assignments = {
            str(a.get("jobId") or a.get("job_id")): a
            for a in c_dict.get("assignments", [])
        }
        old_deferred = {
            str(d.get("jobId") or d.get("job_id")): d
            for d in c_dict.get("deferred_jobs", [])
        }
        failed_resources: List[str] = []

        # 2. Extract Event details
        event_dict = event if isinstance(event, dict) else getattr(event, "__dict__", {})
        event_type_raw = event_dict.get("type") or event_dict.get("event_type") or "OPERATIONAL_UPDATE"
        event_type = event_type_raw.value if hasattr(event_type_raw, "value") else str(event_type_raw)
        payload = event_dict.get("payload", {})

        # Deep clone inputs to ensure immutability
        jobs_copy = [copy.deepcopy(j) for j in current_jobs]
        windows_copy = [copy.deepcopy(w) for w in windows]
        trains_copy = [copy.deepcopy(t) for t in (train_movements or [])]
        locked_copy = dict(locked_assignments or {})
        compat_copy = [copy.deepcopy(cg) for cg in (compat_groups or [])]

        # 3. Apply Event Transformations
        if event_type == EventType.SPECIAL_TRAIN.value:
            # Add or update protected train movement — exactly once.
            new_train = payload.get("train") or payload
            if new_train:
                new_train["isProtected"] = True
                new_id = str(new_train.get("id") or new_train.get("trainId") or new_train.get("number") or "")
                duplicate = False
                for t in trains_copy:
                    t_id = str(t.get("id") or t.get("number") or "")
                    # Same id, or identical corridor+start+end already present.
                    if new_id and t_id == new_id:
                        duplicate = True
                        break
                    if (
                        str(t.get("corridorId") or "") == str(new_train.get("corridorId") or "")
                        and str(t.get("start") or "") == str(new_train.get("start") or "")
                        and str(t.get("end") or "") == str(new_train.get("end") or "")
                    ):
                        duplicate = True
                        break
                if not duplicate:
                    trains_copy.append(new_train)

        elif event_type == EventType.TRAIN_CANCELLED.value:
            # Remove train from timetable
            train_id = str(payload.get("trainId") or payload.get("train_id") or payload.get("id") or "")
            trains_copy = [t for t in trains_copy if str(t.get("id") or t.get("number")) != train_id]

        elif event_type == EventType.RESOURCE_FAILURE.value:
            # Resource failure: report the failure honestly per affected job
            # via reason codes. NEVER corrupt job corridor ids — the corridor
            # is a canonical reference and must stay intact.
            failed_res = str(payload.get("resource") or payload.get("resource_id") or "").strip().lower()
            if failed_res:
                failed_resources.append(failed_res)
                for j in jobs_copy:
                    j_res = [r.lower() for r in (PriorityEngine._extract_field(j, "resources", default=[]) or [])]
                    if failed_res in j_res:
                        if isinstance(j, dict):
                            j.setdefault("failed_resources", []).append(failed_res)
                            j["resource_failed"] = True
                        elif hasattr(j, "resource_failed"):
                            j.resource_failed = True

        elif event_type == EventType.EMERGENCY_JOB.value:
            # Insert emergency job (Tier 0)
            job_data = payload.get("job") or payload
            emer_job = MaintenanceJob.from_dict(job_data) if isinstance(job_data, dict) else job_data
            emer_job.tier = Tier.TIER_0
            jobs_copy.insert(0, emer_job)

            # If emergency job requested a target window, lock it
            target_window = payload.get("target_window") or payload.get("windowId")
            if target_window:
                locked_copy[emer_job.id] = target_window

        elif event_type == EventType.WINDOW_REDUCED.value:
            w_id = str(payload.get("windowId") or payload.get("window_id") or payload.get("id") or "")
            new_minutes = int(payload.get("minutes") or payload.get("new_duration") or 0)
            for w in windows_copy:
                if str(w.get("id") or w.get("windowId")) == w_id:
                    w["minutes"] = new_minutes
                    if payload.get("end"):
                        w["end"] = payload["end"]

        elif event_type == EventType.WINDOW_WITHDRAWN.value:
            w_id = str(payload.get("windowId") or payload.get("window_id") or payload.get("id") or "")
            windows_copy = [w for w in windows_copy if str(w.get("id") or w.get("windowId")) != w_id]

        elif event_type == EventType.PRIORITY_CHANGE.value:
            target_id = str(payload.get("jobId") or payload.get("job_id") or "")
            new_tier = int(payload.get("tier") or 0)
            for j in jobs_copy:
                curr_id = str(PriorityEngine._extract_field(j, "id", "job_id", "jobId", default=""))
                if curr_id == target_id:
                    if isinstance(j, dict):
                        j["tier"] = new_tier
                    elif hasattr(j, "tier"):
                        j.tier = new_tier

        elif event_type == EventType.OPERATIONAL_RESTRICTION.value:
            target_corridor = str(payload.get("corridorId") or payload.get("corridor_id") or "")
            if payload.get("forbidPowerIsolation"):
                for w in windows_copy:
                    if str(w.get("corridorId")) == target_corridor:
                        w["allowsPowerIsolation"] = False

        # 4. Run CP-SAT Re-Optimization
        obj_builder = ObjectiveBuilder.from_mode(mode)
        optimizer = CpSatOptimizer(objective_builder=obj_builder)
        planner = Planner(optimizer=optimizer, objective_builder=obj_builder, plan_version=new_version)

        new_plan_result = planner.solve(
            jobs=jobs_copy,
            windows=windows_copy,
            compat_groups=compat_copy,
            train_movements=trains_copy,
            locked_assignments=locked_copy,
            supported_departments=supported_departments,
            failed_resources=failed_resources,
        )

        new_dict = new_plan_result.to_dict()
        new_assignments = {
            str(a.get("jobId") or a.get("job_id")): a
            for a in new_dict.get("assignments", [])
        }
        new_deferred = {
            str(d.get("jobId") or d.get("job_id")): d
            for d in new_dict.get("deferred_jobs", [])
        }

        # 5. Compute Audit Diffs
        changed_assignments: List[Dict[str, Any]] = []
        unchanged_assignments: List[Dict[str, Any]] = []
        newly_deferred: List[Dict[str, Any]] = []
        newly_scheduled: List[Dict[str, Any]] = []
        reason_codes_set: Set[str] = set()

        for j_id, new_a in new_assignments.items():
            if j_id in old_assignments:
                old_a = old_assignments[j_id]
                if old_a.get("windowId") == new_a.get("windowId") and old_a.get("start") == new_a.get("start"):
                    unchanged_assignments.append(new_a)
                else:
                    changed_assignments.append(new_a)
            else:
                # Newly scheduled (was either deferred before or new job)
                newly_scheduled.append(new_a)

        for j_id, def_job in new_deferred.items():
            if j_id in old_assignments:
                # Was scheduled in r1, but now deferred in r2
                newly_deferred.append(def_job)
                for rc in def_job.get("reason_codes", [def_job.get("code")]):
                    if rc:
                        reason_codes_set.add(rc)

        # 6. Build Replanning Result
        return ReplanningResult(
            status=new_dict.get("status", "OPTIMAL"),
            plan_version=new_version,
            trigger=event_type,
            changed_assignments=changed_assignments,
            unchanged_assignments=unchanged_assignments,
            newly_deferred_jobs=newly_deferred,
            newly_scheduled_jobs=newly_scheduled,
            metrics=new_dict.get("metrics", {}),
            train_impacts=new_dict.get("metrics", {}).get("train_impact", []),
            reason_codes=sorted(list(reason_codes_set)),
            assignments=new_dict.get("assignments", []),
            deferred_jobs=new_dict.get("deferred_jobs", []),
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    @classmethod
    def emergency_insertion(
        cls,
        current_plan: Union[PlannerResult, Dict[str, Any]],
        emergency_job: Union[MaintenanceJob, Dict[str, Any]],
        current_jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
        compat_groups: Optional[Sequence[Dict[str, Any]]] = None,
        locked_assignments: Optional[Dict[str, str]] = None,
        target_window_id: Optional[str] = None,
    ) -> ReplanningResult:
        """Dedicated emergency insertion workflow (Feature 20).

        1. Treats job as Tier 0 (Emergency).
        2. Pre-empts/reserves required resources first.
        3. Protects block window for emergency possession.
        4. Re-optimizes remaining work across available capacity.
        5. Preserves locked assignments.
        """
        event = {
            "type": EventType.EMERGENCY_JOB.value,
            "payload": {
                "job": emergency_job,
                "target_window": target_window_id,
            },
        }

        return cls.replan(
            current_plan=current_plan,
            current_jobs=current_jobs,
            windows=windows,
            event=event,
            train_movements=train_movements,
            compat_groups=compat_groups,
            locked_assignments=locked_assignments,
            mode=OptimizationMode.SAFETY_FIRST,  # Safety-first for emergency response
        )
