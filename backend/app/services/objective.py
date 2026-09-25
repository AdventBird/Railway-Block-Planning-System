"""Objective Builder for Railway CP-SAT Optimization.

Constructs modular, configurable soft objective coefficients for the CP-SAT model:
1. Maintenance Completed (reward for executing work)
2. Priority Score (higher reward for high-tier and high internal score jobs)
3. Train Impact Cost (penalty for disruption to train movements)
4. Block Utilization Bonus (reward for productive usage of sanctioned block minutes)
5. Backlog / Anti-Starvation Penalty (penalty for deferring starving department jobs)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Union

from backend.app.services.fairness import FairnessEngine
from backend.app.services.priority import MaintenanceJob, PriorityEngine, Tier


from enum import Enum


class OptimizationMode(str, Enum):
    """Supported optimization profile modes."""

    SAFETY_FIRST = "SAFETY_FIRST"
    BALANCED = "BALANCED"
    PUNCTUALITY_FIRST = "PUNCTUALITY_FIRST"


# ---------------------------------------------------------------------------
# Configurable Base Weights (Scaled for CP-SAT Integer Arithmetic)
# ---------------------------------------------------------------------------
BASE_MAINTENANCE_REWARD: int = 2000

# Priority Tier Bonuses
TIER_REWARD_BONUS: Dict[int, int] = {
    Tier.TIER_0: 10000,  # Emergency
    Tier.TIER_1: 5000,   # Safety-critical
    Tier.TIER_2: 2500,   # Deadline-critical
    Tier.TIER_3: 1000,   # High importance
    Tier.TIER_4: 400,    # Normal / Routine
}

# Mode Profiles
MODE_PROFILES: Dict[str, Dict[str, Any]] = {
    OptimizationMode.SAFETY_FIRST.value: {
        "base_reward": 3500,
        "tier_bonuses": {
            Tier.TIER_0: 15000,
            Tier.TIER_1: 8000,
            Tier.TIER_2: 4000,
            Tier.TIER_3: 1500,
            Tier.TIER_4: 500,
        },
        "train_impact_penalty": 150,  # Safety dominates over train regulation
        "utilization_rate": 3,
        "backlog_multiplier": 300,
    },
    OptimizationMode.BALANCED.value: {
        "base_reward": 2000,
        "tier_bonuses": TIER_REWARD_BONUS,
        "train_impact_penalty": 500,
        "utilization_rate": 2,
        "backlog_multiplier": 150,
    },
    OptimizationMode.PUNCTUALITY_FIRST.value: {
        "base_reward": 1200,
        "tier_bonuses": {
            Tier.TIER_0: 10000,  # Emergencies still respected
            Tier.TIER_1: 3000,
            Tier.TIER_2: 1200,
            Tier.TIER_3: 500,
            Tier.TIER_4: 200,
        },
        "train_impact_penalty": 2500,  # Train impact dominates
        "utilization_rate": 1,
        "backlog_multiplier": 75,
    },
}

# Internal score multiplier (0.0 to 100.0 score -> 0 to 500 bonus)
INTERNAL_SCORE_MULTIPLIER: int = 5

# Utilization bonus per productive minute occupied
UTILIZATION_BONUS_PER_MINUTE: int = 2

# Train impact penalty per affected train movement
TRAIN_IMPACT_PENALTY_PER_TRAIN: int = 500

# Department backlog penalty multiplier for deferring starving departments
BACKLOG_DEFERRAL_PENALTY_MULTIPLIER: int = 150


@dataclass
class JobObjectiveCoefficients:
    """Coefficients computed for a single job."""

    job_id: str
    assignment_reward: int
    deferral_penalty: int
    tier: int
    internal_score: float
    department: str


class ObjectiveBuilder:
    """Constructs optimization weights for CP-SAT solver."""

    def __init__(
        self,
        base_reward: int = BASE_MAINTENANCE_REWARD,
        tier_bonuses: Optional[Dict[int, int]] = None,
        train_impact_penalty: int = TRAIN_IMPACT_PENALTY_PER_TRAIN,
        utilization_rate: int = UTILIZATION_BONUS_PER_MINUTE,
        backlog_multiplier: int = BACKLOG_DEFERRAL_PENALTY_MULTIPLIER,
        mode: str = OptimizationMode.BALANCED.value,
    ) -> None:
        self.base_reward = base_reward
        self.tier_bonuses = tier_bonuses or TIER_REWARD_BONUS
        self.train_impact_penalty = train_impact_penalty
        self.utilization_rate = utilization_rate
        self.backlog_multiplier = backlog_multiplier
        self.mode = mode

    @classmethod
    def from_mode(cls, mode: Union[str, OptimizationMode] = OptimizationMode.BALANCED) -> ObjectiveBuilder:
        """Create an ObjectiveBuilder configured for a specific optimization mode."""
        mode_str = mode.value if isinstance(mode, OptimizationMode) else str(mode).upper()
        profile = MODE_PROFILES.get(mode_str, MODE_PROFILES[OptimizationMode.BALANCED.value])

        return cls(
            base_reward=profile["base_reward"],
            tier_bonuses=profile["tier_bonuses"],
            train_impact_penalty=profile["train_impact_penalty"],
            utilization_rate=profile["utilization_rate"],
            backlog_multiplier=profile["backlog_multiplier"],
            mode=mode_str,
        )

    def maintenance_score(self, job: Union[MaintenanceJob, Dict[str, Any]]) -> int:
        """Calculate base reward for scheduling a job."""
        return self.base_reward

    def priority_score(self, job: Union[MaintenanceJob, Dict[str, Any]]) -> int:
        """Calculate reward derived from hard tier and internal priority score."""
        tier = PriorityEngine.assign_tier(job)
        score = PriorityEngine.calculate_internal_score(job)

        tier_bonus = self.tier_bonuses.get(tier, self.tier_bonuses[Tier.TIER_4])
        score_bonus = int(score * INTERNAL_SCORE_MULTIPLIER)

        return tier_bonus + score_bonus

    def train_impact_cost(
        self,
        job: Union[MaintenanceJob, Dict[str, Any]],
        window: Dict[str, Any],
        train_movements: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> int:
        """Calculate penalty cost if scheduling the job in this window impacts train movements."""
        impacted_trains = 0
        if train_movements:
            corridor = str(window.get("corridorId") or window.get("corridor_id") or "")
            for train in train_movements:
                if str(train.get("corridorId") or train.get("corridor_id") or "") == corridor:
                    # Friction detected
                    impacted_trains += 1
        else:
            impacts = window.get("affectedTrains") or window.get("affected_trains") or []
            impacted_trains = len(impacts)

        return impacted_trains * self.train_impact_penalty

    def utilization_bonus(
        self,
        job: Union[MaintenanceJob, Dict[str, Any]],
        window: Dict[str, Any],
    ) -> int:
        """Calculate utilization bonus for minutes occupied in the window."""
        duration = 0
        if isinstance(job, dict):
            duration = int(job.get("duration_minutes") or job.get("minutes") or 0)
        else:
            duration = int(getattr(job, "duration_minutes", 0) or getattr(job, "minutes", 0) or 0)

        return duration * self.utilization_rate

    def backlog_penalty(
        self,
        job: Union[MaintenanceJob, Dict[str, Any]],
        department_fairness: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> int:
        """Calculate penalty applied if this job is deferred, protecting starving departments."""
        dept = FairnessEngine.extract_department(job)
        if not department_fairness or dept not in department_fairness:
            return 0

        dept_summary = department_fairness[dept]
        penalty_score = float(dept_summary.get("penalty", 0.0))

        return int(round(penalty_score * self.backlog_multiplier))

    def compute_job_coefficients(
        self,
        job: Union[MaintenanceJob, Dict[str, Any]],
        department_fairness: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> JobObjectiveCoefficients:
        """Compute full objective coefficients for a single job."""
        job_id = str(PriorityEngine._extract_field(job, "id", "job_id", "jobId", default=""))
        dept = FairnessEngine.extract_department(job)
        tier = PriorityEngine.assign_tier(job)
        internal_score = PriorityEngine.calculate_internal_score(job)

        base = self.maintenance_score(job)
        priority = self.priority_score(job)
        defer_cost = self.backlog_penalty(job, department_fairness)

        return JobObjectiveCoefficients(
            job_id=job_id,
            assignment_reward=base + priority,
            deferral_penalty=defer_cost,
            tier=tier,
            internal_score=internal_score,
            department=dept,
        )

    def build_matrix(
        self,
        jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]],
        windows: Sequence[Dict[str, Any]],
        department_fairness: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Build full coefficient matrix for (job, window) pairings and deferrals."""
        job_coeffs: Dict[str, JobObjectiveCoefficients] = {}
        for j in jobs:
            coeffs = self.compute_job_coefficients(j, department_fairness)
            job_coeffs[coeffs.job_id] = coeffs

        window_pair_rewards: Dict[str, Dict[str, int]] = {}
        for j in jobs:
            j_id = str(PriorityEngine._extract_field(j, "id", "job_id", "jobId", default=""))
            base_reward = job_coeffs[j_id].assignment_reward
            window_pair_rewards[j_id] = {}
            for w in windows:
                w_id = str(w.get("id") or w.get("windowId") or "")
                util_bonus = self.utilization_bonus(j, w)
                impact_cost = self.train_impact_cost(j, w)
                window_pair_rewards[j_id][w_id] = base_reward + util_bonus - impact_cost

        return {
            "job_coefficients": job_coeffs,
            "window_rewards": window_pair_rewards,
        }
