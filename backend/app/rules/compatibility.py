"""Feature 11 — deterministic pairwise compatibility engine.

Rules are configuration-driven (``models/compatibility_rules.json``) so
operators can retune coordination policy without touching code. The engine
is pure and side-effect free: CP-SAT can call it per job-pair during model
construction.

Principle preserved: same corridor NEVER implies compatibility — every
verdict traces to an explicit rule id.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from backend.app import config
from backend.app.rules.related import (
    BENIGN_METHODS,
    EXCLUSIVE_METHODS,
    _method_tokens,
)
from backend.app.schemas import BlockType, MaintenanceJob, ValidationMessage

#: Default rules file (overridable per call for tests).
DEFAULT_RULES_PATH = config.APP_DIR / "models" / "compatibility_rules.json"


class Compatibility(str, Enum):
    COMPATIBLE = "COMPATIBLE"
    CONDITIONAL = "CONDITIONAL"
    INCOMPATIBLE = "INCOMPATIBLE"


class Execution(str, Enum):
    PARALLEL = "PARALLEL"
    SEQUENTIAL = "SEQUENTIAL"


def _load_rules(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=8)
def _load_rules_cached(path: str, mtime_ns: int) -> Dict[str, Any]:
    return _load_rules(Path(path))


def load_compatibility_rules(path: Optional[Path] = None) -> Dict[str, Any]:
    """Load (and cache) the compatibility rule configuration."""
    cfg_path = Path(path) if path else DEFAULT_RULES_PATH
    try:
        return _load_rules_cached(str(cfg_path), int(cfg_path.stat().st_mtime_ns))
    except FileNotFoundError as exc:
        raise FileNotFoundError(
            f"Compatibility rules configuration not found at {cfg_path}"
        ) from exc


@dataclass
class CompatibilityVerdict:
    """Outcome of checking two jobs against the rule configuration."""

    job_a: str
    job_b: str
    compatibility: Compatibility = Compatibility.COMPATIBLE
    execution: Optional[Execution] = None
    matched_rule_ids: List[str] = field(default_factory=list)
    reason_codes: List[str] = field(default_factory=list)
    required_isolation: List[str] = field(default_factory=list)
    resource_conflicts: List[str] = field(default_factory=list)
    setup_handover_minutes: int = 0
    rationale: str = ""

    @property
    def bundleable(self) -> bool:
        return self.compatibility != Compatibility.INCOMPATIBLE

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_a": self.job_a,
            "job_b": self.job_b,
            "compatibility": self.compatibility.value
            if isinstance(self.compatibility, Compatibility)
            else self.compatibility,
            "execution": self.execution.value
            if isinstance(self.execution, Execution)
            else self.execution,
            "matched_rule_ids": list(self.matched_rule_ids),
            "reason_codes": list(self.reason_codes),
            "required_isolation": list(self.required_isolation),
            "resource_conflicts": list(self.resource_conflicts),
            "setup_handover_minutes": self.setup_handover_minutes,
            "rationale": self.rationale,
            "bundleable": self.bundleable,
        }


def _isolation_demands(job: MaintenanceJob, rules: Dict[str, Any]) -> List[str]:
    """Isolation tags a job demands (from the config's translation table)."""
    demands: List[str] = []
    table = rules.get("isolation_demand", {})
    if job.power_isolation_required:
        tag = table.get("power_isolation_required", "POWER_ISOLATION")
        demands.append(tag)
    methods = _method_tokens(job)
    if "SIGNALLING_TEST" in methods:
        tag = table.get("energised_testing", "EQUIPMENT_ENERGISED_TEST")
        demands.append(tag)
    return demands


def _shared_resources(job_a: MaintenanceJob, job_b: MaintenanceJob) -> List[str]:
    """Resources both jobs demand (normalised case-insensitively)."""
    a = {r.strip().lower() for r in job_a.required_resources}
    b = {r.strip().lower() for r in job_b.required_resources}
    shared = a & b
    return sorted(shared)


def _isolation_pair_conflict(demands_a: List[str], demands_b: List[str], rules: Dict[str, Any]) -> Optional[List[str]]:
    """Return the conflicting tag pair, if any."""
    conflicting_pairs = rules.get("isolation_conflicts", {}).get("conflicting_pairs", [])
    joined_a, joined_b = set(demands_a), set(demands_b)
    for pair in conflicting_pairs:
        x, y = pair
        if (x in joined_a and y in joined_b) or (y in joined_a and x in joined_b):
            return [x, y]
    return None


class CompatibilityEngine:
    """Deterministic pairwise job compatibility decisions."""

    def __init__(self, rules_path: Optional[Path] = None) -> None:
        self._rules_path = rules_path

    @property
    def rules(self) -> Dict[str, Any]:
        return load_compatibility_rules(self._rules_path)

    # ------------------------------------------------------------------ API

    def check(
        self,
        job_a: MaintenanceJob,
        job_b: MaintenanceJob,
        block_type: Optional[BlockType] = None,
    ) -> CompatibilityVerdict:
        """Decide whether two jobs may share one possession.

        The verdict is INCOMPATIBLE / CONDITIONAL / COMPATIBLE with the rule
        ids that fired; same corridor alone never produces COMPATIBLE.
        """
        rules = self.rules
        methods_a, methods_b = _method_tokens(job_a), _method_tokens(job_b)
        demands_a = _isolation_demands(job_a, rules)
        demands_b = _isolation_demands(job_b, rules)
        shared = _shared_resources(job_a, job_b)

        verdict = CompatibilityVerdict(job_a=job_a.job_id, job_b=job_b.job_id)

        # 1. Hard incompatibilities ------------------------------------------
        for rule in rules.get("incompatibility_rules", []):
            fired, why = self._rule_matches(rule, methods_a, methods_b, demands_a, demands_b, shared, job_a, job_b)
            if fired:
                verdict.matched_rule_ids.append(rule["id"])
                verdict.reason_codes.append(rule.get("reason_code", "INCOMPATIBLE_WORK"))
                verdict.rationale = f"{rule['id']}: {rule['description']} ({why})"
                if rule.get("severity") == "INCOMPATIBLE":
                    verdict.compatibility = Compatibility.INCOMPATIBLE
                    return verdict
                # severity CONDITIONAL falls through to the conditional phase

        # 2. Conditional coordination ----------------------------------------
        conditional_hits: List[Dict[str, Any]] = []
        for rule in rules.get("conditional_rules", []):
            fired, why = self._rule_matches(rule, methods_a, methods_b, demands_a, demands_b, shared, job_a, job_b)
            if fired:
                conditional_hits.append((rule, why))  # type: ignore[arg-type]
                verdict.matched_rule_ids.append(rule["id"])
                verdict.reason_codes.append(rule.get("reason_code", "RESOURCE_CONFLICT"))

        if conditional_hits:
            verdict.compatibility = Compatibility.CONDITIONAL
            # Execution is sequential unless every conditional rule says parallel.
            verdict.execution = Execution.SEQUENTIAL
            handover = rules.get("overheads", {}).get("sequential_handover_overhead", 15)
            verdict.setup_handover_minutes = handover
            first_rule, first_why = conditional_hits[0]
            verdict.rationale = f"{first_rule['id']}: {first_rule['description']} ({first_why})"
            # Required isolation: union of both jobs' demands.
            verdict.required_isolation = sorted(set(demands_a) | set(demands_b))
            verdict.resource_conflicts = shared
            return verdict

        # 3. Default: compatible when methods don't interact -------------------
        interacting = bool(methods_a & EXCLUSIVE_METHODS) and bool(methods_b & EXCLUSIVE_METHODS)
        benign_pair = (
            (methods_a & BENIGN_METHODS or not methods_a)
            and (methods_b & BENIGN_METHODS or not methods_b)
        )
        if not interacting and (benign_pair or not (methods_a & EXCLUSIVE_METHODS and methods_b)):
            verdict.compatibility = Compatibility.COMPATIBLE
            verdict.execution = Execution.PARALLEL
            verdict.setup_handover_minutes = rules.get("overheads", {}).get("parallel_merge_overhead", 5)
            verdict.required_isolation = sorted(set(demands_a) | set(demands_b))
            if shared:
                verdict.resource_conflicts = shared
                verdict.compatibility = Compatibility.CONDITIONAL
                verdict.execution = Execution.SEQUENTIAL
                verdict.rationale = (
                    "Jobs share a resource and must be sequenced around it."
                )
            else:
                verdict.rationale = (
                    "Work methods do not interact and no conflicting isolation is "
                    "required — not merely because the jobs share a corridor."
                )
            return verdict

        # 4. Fallback — exclusive-method collision without an explicit rule.
        verdict.compatibility = Compatibility.INCOMPATIBLE
        verdict.reason_codes.append("INCOMPATIBLE_WORK")
        verdict.rationale = "Work methods collide on exclusive track occupancy."
        return verdict

    def check_all(
        self,
        jobs: Sequence[MaintenanceJob],
        block_type: Optional[BlockType] = None,
    ) -> List[CompatibilityVerdict]:
        """Pairwise verdicts for a whole candidate set."""
        return [
            self.check(jobs[i], jobs[j], block_type)
            for i in range(len(jobs))
            for j in range(i + 1, len(jobs))
        ]

    # ------------------------------------------------------------------ rule matching

    def _rule_matches(
        self,
        rule: Dict[str, Any],
        methods_a: set,
        methods_b: set,
        demands_a: List[str],
        demands_b: List[str],
        shared_resources: List[str],
        job_a: MaintenanceJob,
        job_b: MaintenanceJob,
    ) -> tuple[bool, str]:
        """Evaluate one config rule against the pair; returns (fired, why)."""
        when = rule.get("when", {})

        # isolation pair pattern
        if "isolation_pair" in when:
            pair = _isolation_pair_conflict(demands_a, demands_b, self.rules)
            if pair:
                return True, f"isolation demands {pair[0]} + {pair[1]} conflict"
            return False, ""

        # shared resource class pattern
        if "shared_resource_class" in when:
            if shared_resources:
                return True, f"both demand {shared_resources[0]}"
            return False, ""

        # method patterns
        method_a = when.get("method_a")
        method_b = when.get("method_b")
        if method_a and method_b:
            hit_a = _methods_hit(methods_a, method_a)
            hit_b = _methods_hit(methods_b, method_b)
            hit_cross = _methods_hit(methods_a, method_b) and _methods_hit(methods_b, method_a)
            if (hit_a and hit_b) or hit_cross:
                return True, "work methods match the exclusion pattern"
            return False, ""

        # explicit-attribute patterns (extensible without code changes)
        if "requirement" in when:
            req = when["requirement"]
            if req == "power_isolation" and (job_a.power_isolation_required or job_b.power_isolation_required):
                return True, "one job requires OHE isolation"
            return False, ""

        return False, ""


def _methods_hit(methods: set, pattern: List[str]) -> bool:
    """Does the method set match a config pattern ('ANY' matches non-empty)?"""
    if "ANY" in pattern:
        return bool(methods)
    return bool(methods & set(pattern))
