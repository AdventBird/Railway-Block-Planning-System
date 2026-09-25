"""Two-Level Priority Engine for Railway Maintenance Block Planning.

Assigns maintenance jobs to hard priority tiers (Tier 0-4) and computes an
internal weighted score used strictly for intra-tier ordering. The numeric
score remains internal to the backend and is never exposed in public models
or frontend payloads.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union


class Tier(IntEnum):
    """Hard priority tiers for railway block planning."""

    TIER_0 = 0  # Emergency
    TIER_1 = 1  # Safety-critical
    TIER_2 = 2  # Deadline-critical
    TIER_3 = 3  # High
    TIER_4 = 4  # Normal


# Canonical human-readable names for each priority tier
TIER_NAMES: Dict[int, str] = {
    Tier.TIER_0: "Emergency",
    Tier.TIER_1: "Safety-critical",
    Tier.TIER_2: "Deadline-critical",
    Tier.TIER_3: "High",
    Tier.TIER_4: "Normal",
}

# ---------------------------------------------------------------------------
# Internal Scoring Weights (Sum = 1.00)
# ---------------------------------------------------------------------------
WEIGHT_SEVERITY: float = 0.30
WEIGHT_ASSET_CRITICALITY: float = 0.25
WEIGHT_OVERDUE_AGE: float = 0.20
WEIGHT_DEADLINE_PRESSURE: float = 0.15
WEIGHT_OPERATIONAL_IMPACT: float = 0.10

# Scale bounds for internal factors (0.0 to 100.0)
MIN_SCORE: float = 0.0
MAX_SCORE: float = 100.0

# ---------------------------------------------------------------------------
# Configurable Factor Value Mappings (0.0 to 100.0)
# ---------------------------------------------------------------------------
SEVERITY_SCORES: Dict[str, float] = {
    "EMERGENCY": 100.0,
    "CRITICAL": 85.0,
    "HIGH": 65.0,
    "MEDIUM": 40.0,
    "LOW": 15.0,
    "ROUTINE": 10.0,
}

ASSET_CRITICALITY_SCORES: Dict[str, float] = {
    "CRITICAL": 100.0,
    "HIGH": 80.0,
    "MEDIUM": 50.0,
    "LOW": 20.0,
}

OPERATIONAL_IMPACT_SCORES: Dict[str, float] = {
    "CRITICAL": 100.0,
    "HIGH": 75.0,
    "MEDIUM": 50.0,
    "LOW": 25.0,
}

# ---------------------------------------------------------------------------
# Domain keyword dictionaries for deterministic rule evaluation
# ---------------------------------------------------------------------------
EMERGENCY_KEYWORDS: Tuple[str, ...] = (
    "shattered",
    "emergency",
    "derailment",
    "broken rail",
    "buckled track",
    "washout",
    "uncontrolled",
    "cannot carry traffic",
)

SAFETY_CRITICAL_KEYWORDS: Tuple[str, ...] = (
    "fracture",
    "usfd",
    "interlocking failure",
    "point failure",
    "signal failure",
    "dewirement",
    "caution imposed",
    "tsr at risk",
)

DEADLINE_CRITICAL_KEYWORDS: Tuple[str, ...] = (
    "overdue",
    "immediate",
    "now",
    "expired",
)

HIGH_IMPORTANCE_KEYWORDS: Tuple[str, ...] = (
    "renewal",
    "mandatory cycle",
    "post-monsoon",
    "bridge",
    "bearing",
    "axle counter",
    "tamping",
    "leveling",
    "deep screening",
)


@dataclass
class MaintenanceJob:
    """Canonical model for a railway maintenance job.

    Supports both camelCase and snake_case attributes.
    Crucially, does not expose internal numeric scores in its public representation.
    """

    id: str
    title: str = ""
    department: str = ""  # Engineering | S&T | TRD
    source: str = ""  # TMS | SMMS | TDMS | BDMS
    corridor_id: str = ""
    asset: str = ""
    duration_minutes: int = 0
    deadline: str = ""
    tier: Optional[int] = None
    tier_reason: str = ""
    resources: List[str] = field(default_factory=list)
    needs_power_isolation: bool = False
    severity: Optional[Union[str, int, float]] = None
    asset_criticality: Optional[Union[str, int, float]] = None
    overdue_age: Optional[float] = None  # In hours or days
    overdue_days: Optional[float] = None
    deadline_pressure: Optional[Union[str, float]] = None
    operational_impact: Optional[Union[str, int, float]] = None
    status: str = "pending"

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> MaintenanceJob:
        """Create a MaintenanceJob instance from a dictionary, handling camelCase aliases."""
        return cls(
            id=str(data.get("id") or data.get("job_id") or data.get("jobId") or ""),
            title=str(data.get("title") or ""),
            department=str(data.get("department") or data.get("dept") or ""),
            source=str(data.get("source") or data.get("source_system") or ""),
            corridor_id=str(data.get("corridor_id") or data.get("corridorId") or ""),
            asset=str(data.get("asset") or data.get("asset_name") or ""),
            duration_minutes=int(data.get("duration_minutes") or data.get("minutes") or 0),
            deadline=str(data.get("deadline") or data.get("due") or ""),
            tier=int(data["tier"]) if data.get("tier") is not None else None,
            tier_reason=str(data.get("tier_reason") or data.get("tierReason") or ""),
            resources=list(data.get("resources") or []),
            needs_power_isolation=bool(
                data.get("needs_power_isolation") or data.get("needsPowerIsolation") or False
            ),
            severity=data.get("severity"),
            asset_criticality=data.get("asset_criticality") or data.get("assetCriticality"),
            overdue_age=float(data["overdue_age"]) if data.get("overdue_age") is not None else None,
            overdue_days=float(data["overdue_days"]) if data.get("overdue_days") is not None else None,
            deadline_pressure=data.get("deadline_pressure") or data.get("deadlinePressure"),
            operational_impact=data.get("operational_impact") or data.get("operationalImpact"),
            status=str(data.get("status") or "pending"),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary without exposing internal scores."""
        return {
            "id": self.id,
            "title": self.title,
            "dept": self.department,
            "source": self.source,
            "corridorId": self.corridor_id,
            "asset": self.asset,
            "minutes": self.duration_minutes,
            "deadline": self.deadline,
            "tier": self.tier,
            "tierReason": self.tier_reason,
            "resources": list(self.resources),
            "needsPowerIsolation": self.needs_power_isolation,
            "status": self.status,
        }


class PriorityEngine:
    """Two-Level Priority Engine for Railway Maintenance Jobs.

    1. Hard Priority Tiers (0-4): Precedence strictly wins across tiers.
    2. Internal Weighted Score: Deterministic score (0-100) strictly for ordering
       jobs within the same tier. Never exposed to the frontend or API outputs.
    """

    @classmethod
    def _extract_field(
        cls, job: Union[MaintenanceJob, Dict[str, Any]], *field_names: str, default: Any = None
    ) -> Any:
        """Extract a field value by checking multiple potential names."""
        for name in field_names:
            if isinstance(job, dict):
                if name in job and job[name] is not None:
                    return job[name]
            elif hasattr(job, name):
                val = getattr(job, name)
                if val is not None:
                    return val
        return default

    @classmethod
    def normalize(
        cls, value: float, min_val: float = MIN_SCORE, max_val: float = MAX_SCORE
    ) -> float:
        """Normalize a numeric value to a [0.0, 100.0] scale deterministically.

        Clamps out-of-range values and safely handles zero or inverted ranges.
        """
        if max_val <= min_val:
            return MIN_SCORE
        clamped = max(min_val, min(max_val, float(value)))
        normalized = ((clamped - min_val) / (max_val - min_val)) * 100.0
        return round(normalized, 4)

    @classmethod
    def assign_tier(cls, job: Union[MaintenanceJob, Dict[str, Any]]) -> int:
        """Assign a maintenance job to a hard priority tier (0-4) using deterministic rules.

        Precedence:
        - Tier 0: Emergency (e.g. shattered insulator, broken rail, cannot carry traffic)
        - Tier 1: Safety-critical (e.g. USFD fracture, signal/interlocking failure)
        - Tier 2: Deadline-critical (e.g. overdue maintenance, immediate expiry)
        - Tier 3: High importance (e.g. mandatory inspection cycles, deep screening, track leveling)
        - Tier 4: Normal / Routine (e.g. routine lubrication, cleaning, patrol)
        """
        # If a valid tier is already explicitly set, respect it
        existing_tier = cls._extract_field(job, "tier")
        if existing_tier is not None:
            try:
                tier_int = int(existing_tier)
                if 0 <= tier_int <= 4:
                    return tier_int
            except (ValueError, TypeError):
                pass

        # Inspect textual context for domain rules
        title = str(cls._extract_field(job, "title", default="")).lower()
        asset = str(cls._extract_field(job, "asset", "asset_name", default="")).lower()
        deadline = str(cls._extract_field(job, "deadline", "due", default="")).lower()
        tier_reason = str(cls._extract_field(job, "tier_reason", "tierReason", default="")).lower()
        combined_text = f"{title} {asset} {deadline} {tier_reason}"

        severity = cls._extract_field(job, "severity")
        criticality = cls._extract_field(job, "asset_criticality", "assetCriticality")
        overdue_age = cls._extract_field(job, "overdue_age", "overdue_days", default=0)

        # -------------------------------------------------------------------
        # Rule 0: Emergency Defect -> Tier 0
        # -------------------------------------------------------------------
        if isinstance(severity, str) and severity.upper() == "EMERGENCY":
            return Tier.TIER_0
        if isinstance(severity, (int, float)) and severity >= 5:
            return Tier.TIER_0
        if any(keyword in combined_text for keyword in EMERGENCY_KEYWORDS):
            return Tier.TIER_0

        # -------------------------------------------------------------------
        # Rule 1: Safety-Critical Defect -> Tier 1
        # -------------------------------------------------------------------
        if isinstance(severity, str) and severity.upper() in ("CRITICAL", "SAFETY_CRITICAL"):
            return Tier.TIER_1
        if isinstance(severity, (int, float)) and severity >= 4:
            return Tier.TIER_1
        if (
            isinstance(severity, str)
            and severity.upper() == "HIGH"
            and isinstance(criticality, str)
            and criticality.upper() in ("CRITICAL", "HIGH")
        ):
            return Tier.TIER_1
        if any(keyword in combined_text for keyword in SAFETY_CRITICAL_KEYWORDS):
            return Tier.TIER_1

        # -------------------------------------------------------------------
        # Rule 2: Deadline Approaching / Overdue Maintenance -> Tier 2
        # -------------------------------------------------------------------
        try:
            if float(overdue_age or 0) > 0:
                return Tier.TIER_2
        except (ValueError, TypeError):
            pass

        if any(keyword in combined_text for keyword in DEADLINE_CRITICAL_KEYWORDS):
            return Tier.TIER_2

        # -------------------------------------------------------------------
        # Rule 3: High Operational Importance / Mandatory Cycles -> Tier 3
        # -------------------------------------------------------------------
        impact = cls._extract_field(job, "operational_impact", "operationalImpact")
        if isinstance(impact, str) and impact.upper() in ("CRITICAL", "HIGH"):
            return Tier.TIER_3
        if isinstance(impact, (int, float)) and impact >= 3:
            return Tier.TIER_3
        if isinstance(criticality, str) and criticality.upper() in ("CRITICAL", "HIGH"):
            return Tier.TIER_3
        if any(keyword in combined_text for keyword in HIGH_IMPORTANCE_KEYWORDS):
            return Tier.TIER_3

        # -------------------------------------------------------------------
        # Rule 4: Routine Work -> Tier 4
        # -------------------------------------------------------------------
        return Tier.TIER_4

    @classmethod
    def calculate_internal_score(cls, job: Union[MaintenanceJob, Dict[str, Any]]) -> float:
        """Calculate a normalized internal weighted score (0.0 to 100.0).

        This score is strictly utilized for ordering jobs inside the same tier.
        Factors:
        - Severity (30%): Risk level
        - Asset Criticality (25%): Infrastructure importance
        - Overdue Age (20%): Escalation pressure
        - Deadline Pressure (15%): Time remaining
        - Operational Impact (10%): Service disruption potential
        """
        # 1. Severity Factor
        severity_val = cls._extract_field(job, "severity")
        if isinstance(severity_val, str) and severity_val.upper() in SEVERITY_SCORES:
            severity_factor = SEVERITY_SCORES[severity_val.upper()]
        elif isinstance(severity_val, (int, float)):
            # Normalize 1-5 scale or 0-100 scale
            severity_factor = cls.normalize(severity_val, min_val=0.0, max_val=5.0) if severity_val <= 5.0 else cls.normalize(severity_val, min_val=0.0, max_val=100.0)
        else:
            # Infer from tier or keywords if severity is not explicitly numerical
            tier = cls.assign_tier(job)
            if tier == Tier.TIER_0:
                severity_factor = 100.0
            elif tier == Tier.TIER_1:
                severity_factor = 80.0
            elif tier == Tier.TIER_2:
                severity_factor = 60.0
            elif tier == Tier.TIER_3:
                severity_factor = 40.0
            else:
                severity_factor = 20.0

        # 2. Asset Criticality Factor
        crit_val = cls._extract_field(job, "asset_criticality", "assetCriticality")
        if isinstance(crit_val, str) and crit_val.upper() in ASSET_CRITICALITY_SCORES:
            crit_factor = ASSET_CRITICALITY_SCORES[crit_val.upper()]
        elif isinstance(crit_val, (int, float)):
            crit_factor = cls.normalize(crit_val, min_val=0.0, max_val=5.0) if crit_val <= 5.0 else cls.normalize(crit_val, min_val=0.0, max_val=100.0)
        else:
            # Default moderate criticality for mainline assets, or higher for emergencies
            asset_text = str(cls._extract_field(job, "asset", default="")).lower()
            tier = cls.assign_tier(job)
            if tier == Tier.TIER_0:
                crit_factor = 85.0
            elif any(k in asset_text for k in ("bridge", "interlocking", "ohe mast", "rail", "panel")):
                crit_factor = 75.0
            else:
                crit_factor = 35.0

        # 3. Overdue Age Factor
        overdue_age = cls._extract_field(job, "overdue_age", "overdue_days")
        overdue_score = 0.0
        try:
            if overdue_age is not None and float(overdue_age) > 0:
                # Up to 5 days overdue maps to 100.0 score
                overdue_score = cls.normalize(float(overdue_age), min_val=0.0, max_val=5.0)
            else:
                deadline_str = str(cls._extract_field(job, "deadline", default="")).lower()
                if "overdue" in deadline_str:
                    # Parse days if present, e.g. "Overdue 2 days"
                    match = re.search(r"(\d+)\s*day", deadline_str)
                    days = float(match.group(1)) if match else 2.0
                    overdue_score = cls.normalize(days, min_val=0.0, max_val=5.0)
        except (ValueError, TypeError):
            overdue_score = 0.0

        # 4. Deadline Pressure Factor
        deadline_pressure = cls._extract_field(job, "deadline_pressure", "deadlinePressure")
        if isinstance(deadline_pressure, (int, float)):
            deadline_score = cls.normalize(deadline_pressure, min_val=0.0, max_val=100.0)
        else:
            deadline_str = str(cls._extract_field(job, "deadline", default="")).lower()
            tier = cls.assign_tier(job)
            if tier == Tier.TIER_0 or "immediate" in deadline_str or "first traffic" in deadline_str:
                deadline_score = 100.0
            elif "24" in deadline_str or "today" in deadline_str:
                deadline_score = 80.0
            elif "48" in deadline_str:
                deadline_score = 65.0
            elif "overdue" in deadline_str:
                deadline_score = 90.0
            elif any(m in deadline_str for m in ("sep", "oct", "nov", "dec")):
                deadline_score = 30.0
            else:
                deadline_score = 20.0

        # 5. Operational Impact Factor
        impact_val = cls._extract_field(job, "operational_impact", "operationalImpact")
        if isinstance(impact_val, str) and impact_val.upper() in OPERATIONAL_IMPACT_SCORES:
            impact_factor = OPERATIONAL_IMPACT_SCORES[impact_val.upper()]
        elif isinstance(impact_val, (int, float)):
            impact_factor = cls.normalize(impact_val, min_val=0.0, max_val=5.0) if impact_val <= 5.0 else cls.normalize(impact_val, min_val=0.0, max_val=100.0)
        else:
            # Baseline impact
            needs_power = cls._extract_field(job, "needs_power_isolation", "needsPowerIsolation", default=False)
            duration = cls._extract_field(job, "duration_minutes", "minutes", default=0)
            base_impact = 40.0
            if needs_power:
                base_impact += 25.0
            if duration and int(duration) >= 180:
                base_impact += 25.0
            impact_factor = cls.normalize(base_impact, min_val=0.0, max_val=100.0)

        # Weighted combination
        raw_weighted = (
            (severity_factor * WEIGHT_SEVERITY)
            + (crit_factor * WEIGHT_ASSET_CRITICALITY)
            + (overdue_score * WEIGHT_OVERDUE_AGE)
            + (deadline_score * WEIGHT_DEADLINE_PRESSURE)
            + (impact_factor * WEIGHT_OPERATIONAL_IMPACT)
        )

        return round(cls.normalize(raw_weighted, min_val=MIN_SCORE, max_val=MAX_SCORE), 4)

    @classmethod
    def rank_jobs(
        cls, jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]]
    ) -> List[Union[MaintenanceJob, Dict[str, Any]]]:
        """Rank maintenance jobs deterministically using the Two-Level Priority Engine.

        Ordering Rules:
        1. Primary Key: Tier (Tier 0 to Tier 4). Hard precedence always wins.
           (e.g., Tier 1 with internal score 10 ranks higher than Tier 4 with score 99).
        2. Secondary Key: Internal weighted score descending within the same tier.
        3. Tertiary Key: Job ID ascending (stable deterministic tie-breaker).

        Returns:
            Ordered list of jobs with tiers assigned. Public representations
            DO NOT expose the internal numeric score.
        """
        scored_entries: List[Tuple[int, float, str, int, Union[MaintenanceJob, Dict[str, Any]]]] = []

        for original_idx, job in enumerate(jobs):
            # Compute tier and score
            tier = cls.assign_tier(job)
            score = cls.calculate_internal_score(job)
            job_id = str(cls._extract_field(job, "id", "job_id", "jobId", default=""))

            # Update tier in-place or create updated copy if tier was missing
            if isinstance(job, dict):
                job_copy = copy.deepcopy(job)
                job_copy["tier"] = tier
                if "tierReason" not in job_copy and "tier_reason" not in job_copy:
                    job_copy["tierReason"] = TIER_NAMES.get(tier, "Normal")
                target_job = job_copy
            elif isinstance(job, MaintenanceJob):
                job_copy = copy.deepcopy(job)
                job_copy.tier = tier
                if not job_copy.tier_reason:
                    job_copy.tier_reason = TIER_NAMES.get(tier, "Normal")
                target_job = job_copy
            else:
                # Generic object
                target_job = job
                if hasattr(target_job, "tier") and getattr(target_job, "tier") is None:
                    setattr(target_job, "tier", tier)

            # Sort key tuple: (tier ASC, -score DESC, job_id ASC, original_idx ASC)
            scored_entries.append((tier, -score, job_id, original_idx, target_job))

        # Deterministic sort
        scored_entries.sort(key=lambda item: (item[0], item[1], item[2], item[3]))

        # Return only the ordered jobs (internal scores remain hidden)
        return [entry[4] for entry in scored_entries]

    @classmethod
    def rank_jobs_with_scores(
        cls, jobs: Sequence[Union[MaintenanceJob, Dict[str, Any]]]
    ) -> List[Tuple[Union[MaintenanceJob, Dict[str, Any]], int, float]]:
        """Internal helper for optimizer services that need (job, tier, internal_score) tuples.

        This method is strictly for future optimization algorithms (e.g. CP-SAT weights)
        and must not be connected to API responses or serialized to the frontend.
        """
        scored_entries: List[Tuple[int, float, str, int, Union[MaintenanceJob, Dict[str, Any]], float]] = []

        for original_idx, job in enumerate(jobs):
            tier = cls.assign_tier(job)
            score = cls.calculate_internal_score(job)
            job_id = str(cls._extract_field(job, "id", "job_id", "jobId", default=""))

            if isinstance(job, dict):
                target_job = copy.deepcopy(job)
                target_job["tier"] = tier
            elif isinstance(job, MaintenanceJob):
                target_job = copy.deepcopy(job)
                target_job.tier = tier
            else:
                target_job = job

            scored_entries.append((tier, -score, job_id, original_idx, target_job, score))

        scored_entries.sort(key=lambda item: (item[0], item[1], item[2], item[3]))
        return [(entry[4], entry[0], entry[5]) for entry in scored_entries]

    @classmethod
    def explanation(cls, job: Union[MaintenanceJob, Dict[str, Any]]) -> str:
        """Generate a backend explanation for a job's tier without exposing numerical scoring.

        Example Output:
        Tier 1 (Safety-critical)
        Reason:
        - Critical asset
        - USFD fracture weld repair
        """
        tier = cls.assign_tier(job)
        tier_name = TIER_NAMES.get(tier, "Normal")
        title = str(cls._extract_field(job, "title", default="")).strip()
        asset = str(cls._extract_field(job, "asset", default="")).strip()
        deadline = str(cls._extract_field(job, "deadline", default="")).strip()
        tier_reason = str(cls._extract_field(job, "tier_reason", "tierReason", default="")).strip()
        severity = cls._extract_field(job, "severity")
        criticality = cls._extract_field(job, "asset_criticality", "assetCriticality")
        overdue_age = cls._extract_field(job, "overdue_age", "overdue_days")

        reasons: List[str] = []

        if tier_reason:
            reasons.append(tier_reason)

        if severity:
            reasons.append(f"Severity level: {severity}")

        if criticality:
            reasons.append(f"Asset criticality: {criticality}")

        if overdue_age and float(overdue_age) > 0:
            reasons.append(f"Overdue by {overdue_age} days/hours")
        elif "overdue" in deadline.lower():
            reasons.append("Overdue maintenance schedule")

        if title and not reasons:
            reasons.append(f"Maintenance item: {title}")

        if not reasons:
            reasons.append(f"Classified under {tier_name} based on standard operational rulebook.")

        bullet_points = "\n".join(f"- {r}" for r in reasons)
        return f"Tier {tier} ({tier_name})\nReason:\n{bullet_points}"
