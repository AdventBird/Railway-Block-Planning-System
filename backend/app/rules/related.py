"""Feature 4 — related / co-located work detection.

Identifies jobs that MAY be coordinated. The output is deliberately weaker
than a compatibility verdict: RELATED / COLOCATED / POSSIBLY_BUNDLEABLE are
signals for the planner to investigate, never an instruction to merge.
Sharing a corridor alone is explicitly NOT a relationship.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence

from backend.app.schemas import MaintenanceJob, Section


class Relationship(str, Enum):
    """Strength of coordination signal between two jobs."""

    RELATED = "RELATED"                      # shares the operational picture
    COLOCATED = "COLOCATED"                  # same corridor AND same section
    POSSIBLY_BUNDLEABLE = "POSSIBLY_BUNDLEABLE"  # co-located AND benign methods
    NO_RELATIONSHIP = "NO_RELATIONSHIP"


class RelationshipSignal(str, Enum):
    """Individual evidence bits contributing to a relationship."""

    SAME_CORRIDOR = "SAME_CORRIDOR"
    SAME_SECTION = "SAME_SECTION"
    LOCATION_PROXIMITY = "LOCATION_PROXIMITY"
    ASSET_RELATIONSHIP = "ASSET_RELATIONSHIP"
    OPERATIONAL_WINDOW = "OPERATIONAL_WINDOW"
    WORK_METHOD = "WORK_METHOD"


#: Work methods considered non-interacting (line-side / no heavy plant).
BENIGN_METHODS = {"PATROL", "INSPECTION", "LAMP", "LUBRICATION", "MARKING", "WALKDOWN"}

#: Machine-heavy methods whose occupancy excludes other parties.
EXCLUSIVE_METHODS = {"EXCAVATION", "GRINDING", "TAMPING", "BALLAST"}


@dataclass
class WorkRelationship:
    """Coordination signal for one pair of jobs."""

    job_a: str
    job_b: str
    relationship: Relationship
    signals: List[RelationshipSignal] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    @property
    def bundleable(self) -> bool:
        """Bundleability is NEVER implied by relatedness alone."""
        return self.relationship == Relationship.POSSIBLY_BUNDLEABLE

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_a": self.job_a,
            "job_b": self.job_b,
            "relationship": self.relationship.value
            if isinstance(self.relationship, Relationship)
            else self.relationship,
            "signals": [s.value if isinstance(s, RelationshipSignal) else s for s in self.signals],
            "notes": list(self.notes),
            "bundleable": self.bundleable,
        }


def _method_tokens(job: MaintenanceJob) -> set[str]:
    """Derive coarse work-method tokens from title + asset text."""
    text = f"{job.title} {job.asset}".upper()
    tokens = set()
    if "WELD" in text:
        tokens.add("WELD")
    if "LAMP" in text:
        tokens.add("LAMP")
    if "PATROL" in text or "TROLLEY" in text:
        tokens.add("PATROL")
    if "BALLAST" in text or "BCM" in text:
        tokens.add("EXCAVATION")
    if "GRIND" in text:
        tokens.add("GRINDING")
    if "TAMP" in text:
        tokens.add("TAMPING")
    if "INSPECT" in text or "BEARING" in text:
        tokens.add("INSPECTION")
    if "CABLE" in text or "DUCT" in text:
        tokens.add("DUCT_ACCESS")
    if "OHE" in text or "TENSION" in text or "INSULATOR" in text or "MAST" in text:
        tokens.add("OHE_WORK")
    if "AXLE" in text or "INTERLOCK" in text or "POINT MACHINE" in text:
        tokens.add("SIGNALLING_TEST")
    if "LUBRIC" in text:
        tokens.add("LUBRICATION")
    if "VEGETATION" in text:
        tokens.add("VEGETATION")
    return tokens


def _km_reference(job: MaintenanceJob) -> Optional[float]:
    """Extract the first kilometre reference from the location text, if any."""
    import re

    match = re.search(r"KM\s*(\d+(?:\.\d+)?)", (job.location or "").upper())
    if match:
        return float(match.group(1))
    return None


class RelatedWorkEngine:
    """Deterministic related-work detection over canonical jobs."""

    #: Kilometres within which two jobs count as physically proximate.
    proximity_km: float = 2.0

    def relate(
        self,
        job_a: MaintenanceJob,
        job_b: MaintenanceJob,
        sections: Optional[Sequence[Section]] = None,
    ) -> WorkRelationship:
        """Assess the coordination signal between exactly two jobs."""
        signals: List[RelationshipSignal] = []
        notes: List[str] = []

        same_corridor = job_a.corridor_id == job_b.corridor_id
        if not same_corridor:
            # Different corridors: only an asset relationship can still connect
            # them (e.g. the same interlocking frame fed from two corridors).
            shared_asset = self._asset_relationship(job_a, job_b)
            if shared_asset:
                signals.append(RelationshipSignal.ASSET_RELATIONSHIP)
                return WorkRelationship(
                    job_a.job_id, job_b.job_id, Relationship.RELATED, signals,
                    ["Jobs on different corridors are related only through a shared asset."],
                )
            return WorkRelationship(
                job_a.job_id, job_b.job_id, Relationship.NO_RELATIONSHIP, [],
                ["Different corridors and no shared asset."],
            )

        signals.append(RelationshipSignal.SAME_CORRIDOR)

        same_section = (
            job_a.section_id
            and job_a.section_id == job_b.section_id
        )
        if same_section:
            signals.append(RelationshipSignal.SAME_SECTION)
            notes.append(f"Both jobs reference section {job_a.section_id}.")
        else:
            # Physical proximity via kilometre references.
            km_a, km_b = _km_reference(job_a), _km_reference(job_b)
            if km_a is not None and km_b is not None and abs(km_a - km_b) <= self.proximity_km:
                signals.append(RelationshipSignal.LOCATION_PROXIMITY)
                notes.append(
                    f"Locations {abs(km_a - km_b):.1f} km apart "
                    f"(KM {km_a:g} vs KM {km_b:g})."
                )

        # Asset relationship within the corridor.
        if self._asset_relationship(job_a, job_b):
            signals.append(RelationshipSignal.ASSET_RELATIONSHIP)
            notes.append("Assets interact (machine occupancy / shared structure).")

        # Operational window: deadline pressure bands that would naturally pair.
        if (
            job_a.deadline_pressure == job_b.deadline_pressure
            and job_a.deadline_pressure in ("OVERDUE", "IMMEDIATE")
        ):
            signals.append(RelationshipSignal.OPERATIONAL_WINDOW)
            notes.append(
                f"Both jobs share {job_a.deadline_pressure} deadline pressure."
            )

        methods_a, methods_b = _method_tokens(job_a), _method_tokens(job_b)

        # Work-method evidence: non-interacting method pairs strengthen the signal.
        if methods_a & BENIGN_METHODS and methods_b & BENIGN_METHODS and not (methods_a & EXCLUSIVE_METHODS or methods_b & EXCLUSIVE_METHODS):
            signals.append(RelationshipSignal.WORK_METHOD)
            notes.append("Both work methods are line-side / non-exclusive.")

        # ---- escalate or cap the relationship --------------------------------
        if RelationshipSignal.WORK_METHOD in signals and (
            RelationshipSignal.SAME_SECTION in signals
            or RelationshipSignal.LOCATION_PROXIMITY in signals
        ):
            return WorkRelationship(
                job_a.job_id, job_b.job_id,
                Relationship.POSSIBLY_BUNDLEABLE, signals, notes
                + ["Co-located with non-interacting methods — a compatibility check may still reject bundling."],
            )

        if len(signals) >= 3 or (
            RelationshipSignal.SAME_SECTION in signals and len(signals) >= 2
        ):
            return WorkRelationship(
                job_a.job_id, job_b.job_id, Relationship.COLOCATED, signals, notes,
            )

        return WorkRelationship(
            job_a.job_id, job_b.job_id, Relationship.RELATED, signals, notes
            + ["Same corridor only — relatedness never implies compatibility."],
        )

    def relate_all(
        self,
        jobs: Sequence[MaintenanceJob],
        sections: Optional[Sequence[Section]] = None,
    ) -> List[WorkRelationship]:
        """Pairwise relationship map (upper triangle only, NO_RELATIONSHIP kept)."""
        out: List[WorkRelationship] = []
        for i in range(len(jobs)):
            for j in range(i + 1, len(jobs)):
                out.append(self.relate(jobs[i], jobs[j], sections))
        return out

    @staticmethod
    def _asset_relationship(job_a: MaintenanceJob, job_b: MaintenanceJob) -> bool:
        """Do the two jobs touch interacting assets or exclusive plant?"""
        methods_a, methods_b = _method_tokens(job_a), _method_tokens(job_b)
        # Shared machine token = one party occupies the plant the other needs.
        if methods_a & EXCLUSIVE_METHODS and methods_b & EXCLUSIVE_METHODS:
            return True
        # Excavation over buried S&T ducts — the CG-3 pattern.
        if "EXCAVATION" in methods_a and "DUCT_ACCESS" in methods_b:
            return True
        if "DUCT_ACCESS" in methods_a and "EXCAVATION" in methods_b:
            return True
        return False
