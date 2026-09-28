"""Governance plan store — approval lifecycle, versions, audit trail.

Implements the officer-gated lifecycle on top of the real planner:

    DRAFT → PENDING_APPROVAL → APPROVED → LOCKED
                          ↘ MODIFIED (new version, back to PENDING_APPROVAL)
                          ↘ REJECTED
    STALE      — snapshot comparison detects material input drift
    INFEASIBLE — planner proved no schedule exists

Rules enforced here (§36–38, §46):
- Every action records officer, timestamp, plan version, action, reason,
  affected jobs — appended to an immutable audit trail.
- Modification creates a NEW version (r3 → r4); previous versions are never
  mutated.
- Locked plans reject further mutations until explicitly unlocked.
- Staleness is a derived status computed by comparing the stored planning
  snapshot against the current canonical world.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import copy

ALLOWED_TRANSITIONS: Dict[str, tuple] = {
    "DRAFT": ("PENDING_APPROVAL", "APPROVED", "MODIFIED", "REJECTED"),
    "PENDING_APPROVAL": ("APPROVED", "MODIFIED", "REJECTED", "STALE"),
    "APPROVED": ("LOCKED", "MODIFIED", "STALE"),
    "MODIFIED": ("PENDING_APPROVAL", "APPROVED", "REJECTED", "MODIFIED"),
    "REJECTED": ("MODIFIED", "PENDING_APPROVAL"),
    "LOCKED": (),
    "STALE": ("PENDING_APPROVAL",),  # requires regeneration before activation
    "INFEASIBLE": (),
}

#: Fields whose material change makes a plan STALE (§37).
STALENESS_FIELDS = (
    "severity",
    "tier",
    "deadline",
    "status",
    "required_resources",
    "power_isolation_required",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class AuditEntry:
    """One immutable governance event."""

    entry_id: int
    plan_id: str
    plan_version: str
    timestamp: str
    officer: str
    action: str
    reason: str
    affected_jobs: List[str] = field(default_factory=list)
    event_trigger: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entry_id": self.entry_id,
            "plan_id": self.plan_id,
            "plan_version": self.plan_version,
            "timestamp": self.timestamp,
            "officer": self.officer,
            "action": self.action,
            "reason": self.reason,
            "affected_jobs": list(self.affected_jobs),
            "event_trigger": self.event_trigger,
        }


class PlanStore:
    """In-memory governance store for planner results (one per process)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._plans: Dict[str, Dict[str, Any]] = {}
        self._audit: List[AuditEntry] = []
        self._next_entry_id = 1

    # ------------------------------------------------------------- internals

    def _record(
        self,
        plan_id: str,
        plan_version: str,
        officer: str,
        action: str,
        reason: str,
        affected_jobs: Optional[List[str]] = None,
        event_trigger: Optional[str] = None,
    ) -> AuditEntry:
        entry = AuditEntry(
            entry_id=self._next_entry_id,
            plan_id=plan_id,
            plan_version=plan_version,
            timestamp=_now_iso(),
            officer=officer,
            action=action,
            reason=reason,
            affected_jobs=list(affected_jobs or []),
            event_trigger=event_trigger,
        )
        self._next_entry_id += 1
        self._audit.append(entry)
        return entry

    @staticmethod
    def _check_transition(current: str, target: str) -> None:
        allowed = ALLOWED_TRANSITIONS.get(current, ())
        if target not in allowed:
            raise ValueError(
                f"Transition {current} -> {target} is not permitted (allowed: {', '.join(allowed) or 'none'})."
            )

    # ----------------------------------------------------------------- plans

    def save_plan(
        self,
        plan_result: Dict[str, Any],
        plan_id: Optional[str] = None,
        snapshot: Optional[Dict[str, Any]] = None,
        officer: str = "system",
        event_trigger: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Persist a planner result as a governed plan with immutable revision tracking."""
        with self._lock:
            pid = plan_id or f"PLAN-{len(self._plans) + 1:04d}"
            version = str(plan_result.get("plan_version") or plan_result.get("version") or "r1")
            status = "INFEASIBLE" if plan_result.get("status") == "INFEASIBLE" else "PENDING_APPROVAL"
            rev_id = f"{pid}-rev-1"
            initial_revision = {
                "id": rev_id,
                "plan_id": pid,
                "revision_number": 1,
                "based_on_revision_id": None,
                "created_at": _now_iso(),
                "created_by": officer,
                "reason": "Initial plan generation" if status != "INFEASIBLE" else "Planner proved INFEASIBLE.",
                "status": status,
                "assignments": list(plan_result.get("assignments") or []),
                "deferred_jobs": list(plan_result.get("deferred_jobs") or []),
                "metrics": dict(plan_result.get("metrics") or {}),
                "plan": copy.deepcopy(plan_result),
            }
            record = {
                "plan_id": pid,
                "plan_version": version,
                "status": status,
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
                "snapshot": snapshot or {},
                "plan": copy.deepcopy(plan_result),
                "current_revision_id": rev_id,
                "revisions": [initial_revision],
            }
            self._plans[pid] = record
            self._record(
                pid,
                version,
                officer,
                "CREATED",
                "Plan generated by CP-SAT planner." if status != "INFEASIBLE" else "Planner proved INFEASIBLE.",
                event_trigger=event_trigger,
            )
            return self._public(record)

    def get_plan(self, plan_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            record = self._plans.get(plan_id)
            return self._public(record) if record else None

    def get_plan_or_default(self) -> Optional[Dict[str, Any]]:
        """Most recent plan (single-plan demo convenience)."""
        with self._lock:
            if not self._plans:
                return None
            latest = max(self._plans.values(), key=lambda r: r["created_at"])
            return self._public(latest)

    def list_plans(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [self._public(r) for r in self._plans.values()]

    # --------------------------------------------------------------- actions

    def act(
        self,
        plan_id: str,
        action: str,
        officer: str,
        reason: str = "",
        affected_jobs: Optional[List[str]] = None,
        modified_plan: Optional[Dict[str, Any]] = None,
        new_version: Optional[str] = None,
    ) -> Dict[str, Any]:
        """APPROVE / MODIFY / REJECT / LOCK with full audit semantics and immutable revisions."""
        action = action.upper()
        with self._lock:
            record = self._plans.get(plan_id)
            if record is None:
                raise KeyError(f"Unknown plan '{plan_id}'.")
            if record["status"] == "LOCKED":
                raise ValueError("LOCKED_ASSIGNMENT_CONFLICT: plan is locked — modification and re-approval are blocked.")
            if record["status"] == "STALE" and action in ("APPROVE", "LOCK"):
                raise ValueError("Plan is STALE — regenerate before activation.")

            if action == "APPROVE":
                self._check_transition(record["status"], "APPROVED")
                record["status"] = "APPROVED"
                # Update current active revision status
                curr_rev_id = record.get("current_revision_id")
                for rev in record.get("revisions", []):
                    if rev["id"] == curr_rev_id:
                        rev["status"] = "APPROVED"
            elif action == "REJECT":
                if not reason or not reason.strip():
                    raise ValueError("REJECT_REASON_REQUIRED: A specific reason is required to reject a plan.")
                self._check_transition(record["status"], "REJECTED")
                record["status"] = "REJECTED"
                curr_rev_id = record.get("current_revision_id")
                for rev in record.get("revisions", []):
                    if rev["id"] == curr_rev_id:
                        rev["status"] = "REJECTED"
            elif action == "LOCK":
                if record["status"] != "APPROVED":
                    raise ValueError("LOCK_NOT_PERMITTED: Only an approved plan can be locked.")
                self._check_transition(record["status"], "LOCKED")
                record["status"] = "LOCKED"
                curr_rev_id = record.get("current_revision_id")
                for rev in record.get("revisions", []):
                    if rev["id"] == curr_rev_id:
                        rev["status"] = "LOCKED"
            elif action == "MODIFY":
                self._check_transition(record["status"], "MODIFIED")
                if modified_plan is None:
                    raise ValueError("MODIFY requires the modified plan payload.")
                version = new_version or self._bump_version(record["plan_version"])
                
                # Create a new draft revision without mutating historical revisions
                rev_count = len(record.get("revisions", [])) + 1
                new_rev_id = f"{plan_id}-rev-{rev_count}"
                new_revision = {
                    "id": new_rev_id,
                    "plan_id": plan_id,
                    "revision_number": rev_count,
                    "based_on_revision_id": record.get("current_revision_id"),
                    "created_at": _now_iso(),
                    "created_by": officer,
                    "reason": reason or f"Modified by {officer}",
                    "status": "DRAFT",
                    "assignments": list(modified_plan.get("assignments") or []),
                    "deferred_jobs": list(modified_plan.get("deferred_jobs") or []),
                    "metrics": dict(modified_plan.get("metrics") or {}),
                    "plan": copy.deepcopy(modified_plan),
                }
                record.setdefault("revisions", []).append(new_revision)
                record["current_revision_id"] = new_rev_id
                record["plan"] = modified_plan
                record["plan_version"] = version
                record["status"] = "MODIFIED"
            else:
                raise ValueError(f"Unknown action '{action}'.")

            record["updated_at"] = _now_iso()
            entry = self._record(
                plan_id,
                record["plan_version"],
                officer,
                action,
                reason or "No reason recorded.",
                affected_jobs=affected_jobs,
            )
            out = self._public(record)
            out["audit_entry"] = entry.to_dict()
            return out

    # Domain service helper methods
    def approve_plan(self, plan_id: str, officer: str, reason: str = "") -> Dict[str, Any]:
        return self.act(plan_id, "APPROVE", officer, reason)

    def reject_plan(self, plan_id: str, officer: str, reason: str) -> Dict[str, Any]:
        return self.act(plan_id, "REJECT", officer, reason)

    def modify_plan(
        self,
        plan_id: str,
        officer: str,
        reason: str,
        modified_plan: Dict[str, Any],
        affected_jobs: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        return self.act(plan_id, "MODIFY", officer, reason, affected_jobs=affected_jobs, modified_plan=modified_plan)

    def lock_plan(self, plan_id: str, officer: str, reason: str = "") -> Dict[str, Any]:
        return self.act(plan_id, "LOCK", officer, reason)

    def record_decision(
        self,
        plan_id: str,
        revision_id: str,
        action: str,
        officer: str,
        reason: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        entry = self._record(plan_id, revision_id, officer, action, reason, affected_jobs=[])
        return entry.to_dict()

    @staticmethod
    def _bump_version(version: str) -> str:
        import re

        match = re.search(r"r(\d+)", version)
        if match:
            return re.sub(r"r\d+", f"r{int(match.group(1)) + 1}", version)
        return f"{version}.r2"

    # ------------------------------------------------------------- staleness

    def compute_staleness(self, plan_id: str, current_world: Dict[str, Any]) -> Dict[str, Any]:
        """Compare the stored snapshot against the current canonical world.

        Returns {plan_id, stale, changed_jobs, changed_fields}.
        """
        with self._lock:
            record = self._plans.get(plan_id)
            if record is None:
                raise KeyError(f"Unknown plan '{plan_id}'.")
            snapshot = record.get("snapshot") or {}
            snap_jobs = {j.get("job_id") or j.get("id"): j for j in snapshot.get("jobs", [])}
            cur_jobs = {j.get("job_id") or j.get("id"): j for j in current_world.get("jobs", [])}

            changed_jobs: List[str] = []
            changed_fields: Dict[str, List[str]] = {}
            for job_id, old in snap_jobs.items():
                new = cur_jobs.get(job_id)
                if new is None:
                    changed_jobs.append(job_id)
                    changed_fields[job_id] = ["status"]
                    continue
                diffs = [
                    f for f in STALENESS_FIELDS
                    if str(old.get(f, "")) != str(new.get(f, ""))
                ]
                if diffs:
                    changed_jobs.append(job_id)
                    changed_fields[job_id] = diffs

            for job_id in cur_jobs:
                if job_id not in snap_jobs:
                    changed_jobs.append(job_id)
                    changed_fields[job_id] = ["NEW_JOB"]

            stale = bool(changed_jobs)
            if stale and record["status"] in ("PENDING_APPROVAL", "APPROVED"):
                record["status"] = "STALE"
                record["updated_at"] = _now_iso()
                self._record(
                    plan_id,
                    record["plan_version"],
                    "system",
                    "MARKED_STALE",
                    f"Material input drift: {', '.join(sorted(changed_jobs))}.",
                    affected_jobs=sorted(changed_jobs),
                )
            return {
                "plan_id": plan_id,
                "stale": stale,
                "changed_jobs": sorted(changed_jobs),
                "changed_fields": changed_fields,
            }

    # ----------------------------------------------------------------- audit

    def audit_history(self, plan_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            entries = [
                e for e in self._audit
                if plan_id is None or e.plan_id == plan_id
            ]
            return [e.to_dict() for e in entries]

    # -------------------------------------------------------------- projection

    @staticmethod
    def _public(record: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": record["plan_id"],
            "plan_id": record["plan_id"],
            "plan_version": record["plan_version"],
            "status": record["status"],
            "created_at": record["created_at"],
            "updated_at": record["updated_at"],
            "current_revision_id": record.get("current_revision_id", ""),
            "revisions": record.get("revisions", []),
            "plan": record["plan"],
        }


_PLAN_STORE: Optional[PlanStore] = None
_STORE_LOCK = threading.Lock()


def get_plan_store() -> PlanStore:
    global _PLAN_STORE
    with _STORE_LOCK:
        if _PLAN_STORE is None:
            _PLAN_STORE = PlanStore()
        return _PLAN_STORE
