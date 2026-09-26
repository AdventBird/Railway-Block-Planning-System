"""Feature 13 — conditional merged-possession calculation.

Pure arithmetic over the Feature 12 phases:

- PARALLEL:    max(work durations) + merge overhead + max(setups) + max(restores)
- SEQUENTIAL:  sum(work durations) + handover overhead + sum(setups) + sum(restores)

The WORK phase never equals the possession: setup and restore are always
accounted for separately, and every figure carries an explanation so an
officer (or the CP-SAT model) can audit how it was derived.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Sequence

from backend.app.rules.compatibility import Compatibility, Execution, load_compatibility_rules
from backend.app.schemas import MaintenanceJob


class PossessionBasis(str, Enum):
    SINGLE = "SINGLE"            # one job alone
    PARALLEL = "PARALLEL"        # jobs executed side by side
    SEQUENTIAL = "SEQUENTIAL"    # jobs executed one after another


@dataclass
class PossessionEstimate:
    """Derived possession demand with a step-by-step explanation."""

    basis: PossessionBasis
    job_ids: List[str]
    setup_minutes: int = 0
    work_minutes: int = 0
    restore_minutes: int = 0
    overhead_minutes: int = 0
    total_possession_minutes: int = 0
    explanation: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "basis": self.basis.value if isinstance(self.basis, PossessionBasis) else self.basis,
            "job_ids": list(self.job_ids),
            "setup_minutes": self.setup_minutes,
            "work_minutes": self.work_minutes,
            "restore_minutes": self.restore_minutes,
            "overhead_minutes": self.overhead_minutes,
            "total_possession_minutes": self.total_possession_minutes,
            "explanation": list(self.explanation),
            "warnings": list(self.warnings),
        }


class PossessionCalculator:
    """Deterministic possession-duration derivation."""

    def __init__(self, rules_path=None) -> None:
        self._rules_path = rules_path

    @property
    def _overheads(self) -> Dict[str, int]:
        rules = load_compatibility_rules(self._rules_path)
        return rules.get("overheads", {})

    # ------------------------------------------------------------------ single

    def single(self, job: MaintenanceJob) -> PossessionEstimate:
        """Possession demand for one job alone: setup + work + restore."""
        work = job.duration_minutes or 0
        setup = job.setup_duration_minutes
        restore = job.restore_duration_minutes
        total = setup + work + restore
        return PossessionEstimate(
            basis=PossessionBasis.SINGLE,
            job_ids=[job.job_id],
            setup_minutes=setup,
            work_minutes=work,
            restore_minutes=restore,
            overhead_minutes=0,
            total_possession_minutes=total,
            explanation=[
                f"SETUP {setup} min — protection / machine entry / isolation arrangement.",
                f"WORK {work} min — the productive work phase (job duration).",
                f"RESTORE {restore} min — power certification, withdrawal, pilot verification.",
                f"Total possession {total} min = {setup} + {work} + {restore}.",
            ],
        )

    # ------------------------------------------------------------------ merged

    def merged(
        self,
        jobs: Sequence[MaintenanceJob],
        execution: Execution,
    ) -> PossessionEstimate:
        """Merged possession for two or more jobs under a given execution."""
        if not jobs:
            raise ValueError("merged() needs at least one job")
        if len(jobs) == 1:
            return self.single(jobs[0])

        ids = [j.job_id for j in jobs]
        works = [j.duration_minutes or 0 for j in jobs]
        setups = [j.setup_duration_minutes for j in jobs]
        restores = [j.restore_duration_minutes for j in jobs]

        if execution == Execution.PARALLEL:
            overhead = self._overheads.get("parallel_merge_overhead", 5)
            work = max(works)
            setup = max(setups)          # one protection arrangement covers all
            restore = max(restores)      # one withdrawal covers all
            total = setup + work + restore + overhead
            return PossessionEstimate(
                basis=PossessionBasis.PARALLEL,
                job_ids=ids,
                setup_minutes=setup,
                work_minutes=work,
                restore_minutes=restore,
                overhead_minutes=overhead,
                total_possession_minutes=total,
                explanation=[
                    f"PARALLEL execution of {len(jobs)} jobs "
                    f"({', '.join(ids)}).",
                    f"WORK = max(work durations) = max({works}) = {work} min — "
                    "parties work side by side under one protection.",
                    f"SETUP = max(setups) = {setup} min — a single protection "
                    "arrangement covers all parties.",
                    f"RESTORE = max(restores) = {restore} min — a single "
                    "withdrawal covers all parties.",
                    f"MERGE overhead = {overhead} min — combined protection "
                    "arrangement / method statement.",
                    f"Total possession {total} min = {setup} + {work} + {restore} + {overhead}.",
                ],
            )

        # Sequential
        overhead = self._overheads.get("sequential_handover_overhead", 15)
        work = sum(works)
        setup = max(setups)
        restore = max(restores)
        # one handover between each pair of consecutive jobs
        handovers = overhead * (len(jobs) - 1)
        total = setup + work + restore + handovers
        return PossessionEstimate(
            basis=PossessionBasis.SEQUENTIAL,
            job_ids=ids,
            setup_minutes=setup,
            work_minutes=work,
            restore_minutes=restore,
            overhead_minutes=handovers,
            total_possession_minutes=total,
            explanation=[
                f"SEQUENTIAL execution of {len(jobs)} jobs ({' → '.join(ids)}).",
                f"WORK = sum(work durations) = {' + '.join(str(w) for w in works)} "
                f"= {work} min — jobs cannot overlap.",
                f"SETUP = max(setups) = {setup} min — the longest entry arrangement.",
                f"RESTORE = max(restores) = {restore} min — the longest withdrawal.",
                f"HANDOVER overhead = {overhead} min x {len(jobs) - 1} = {handovers} min — "
                "departmental handover between consecutive jobs.",
                f"Total possession {total} min = {setup} + {work} + {restore} + {handovers}.",
            ],
        )

    # ------------------------------------------------------------- conditional

    def merged_from_verdict(self, jobs: Sequence[MaintenanceJob], verdict) -> PossessionEstimate:
        """Derive possession from a CompatibilityVerdict.

        INCOMPATIBLE verdicts raise — there is no merged possession to size.
        """
        if verdict.compatibility == Compatibility.INCOMPATIBLE:
            raise ValueError(
                f"Jobs {verdict.job_a} + {verdict.job_b} are INCOMPATIBLE "
                f"({verdict.rationale}) — no merged possession exists."
            )
        execution = verdict.execution or Execution.SEQUENTIAL
        estimate = self.merged(jobs, execution)
        if verdict.matched_rule_ids:
            estimate.explanation.insert(
                0,
                f"Compatibility verdict {verdict.compatibility.value} via "
                f"rules {', '.join(verdict.matched_rule_ids)}.",
            )
        return estimate


def work_phases_minutes(job: MaintenanceJob) -> Dict[str, int]:
    """Feature 12 helper: the explicit phase split for one job."""
    return {
        "setup": job.setup_duration_minutes,
        "work": job.duration_minutes or 0,
        "restore": job.restore_duration_minutes,
        "total_possession": (job.duration_minutes or 0)
        + job.setup_duration_minutes
        + job.restore_duration_minutes,
    }
