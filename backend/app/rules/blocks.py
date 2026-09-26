"""Feature 9 — block taxonomy & compatibility rules.

The taxonomy is the canonical enum {TRAFFIC, POWER, POWER_AND_TRAFFIC}.
Compatibility is a *rule decision*, not an implication: e.g. a POWER block
never covers a job that needs line access, and a TRAFFIC block never covers
work that must de-energise the OHE.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from backend.app.schemas import BlockType, MaintenanceJob, ValidationMessage


@dataclass
class BlockCompatibility:
    """Outcome of checking one job against one block type."""

    compatible: bool
    reasons: List[ValidationMessage] = field(default_factory=list)

    @property
    def summary(self) -> str:
        if self.compatible:
            return "Job can be executed under this block type."
        return "; ".join(m.message for m in self.reasons) or "Job cannot use this block type."


class BlockRuleEngine:
    """Deterministic job <-> block-type compatibility decisions."""

    def check(self, job: MaintenanceJob, block_type: BlockType | str) -> BlockCompatibility:
        """Decide whether ``job`` may be executed under ``block_type``."""
        if isinstance(block_type, str):
            try:
                block_type = BlockType(block_type.upper())
            except ValueError as exc:
                raise ValueError(f"Unknown block type '{block_type}'") from exc

        reasons: List[ValidationMessage] = []

        # Rule 1 — the job's own requirement must be covered by the block.
        if job.block_type is not None and not _covers(block_type, job.block_type):
            reasons.append(ValidationMessage(
                code="BLOCK_TYPE_MISMATCH",
                field="block_type",
                severity="ERROR",
                message=(
                    f"Job requires a {job.block_type} block; a {block_type.value} block "
                    f"does not cover it."
                ),
            ))

        # Rule 2 — power isolation must be backed by a power block.
        if job.power_isolation_required and block_type == BlockType.TRAFFIC:
            reasons.append(ValidationMessage(
                code="ISOLATION_NOT_GRANTED",
                field="block_type",
                severity="ERROR",
                message=(
                    "Job needs OHE isolation but a TRAFFIC block keeps the traction "
                    "power on — request POWER or POWER_AND_TRAFFIC instead."
                ),
            ))

        # Rule 3 — a POWER-only block cannot host jobs needing line access.
        needs_line_access = job.block_type in ("TRAFFIC", "POWER_AND_TRAFFIC") or (
            job.block_type is None and not job.power_isolation_required
        )
        if block_type == BlockType.POWER and needs_line_access:
            reasons.append(ValidationMessage(
                code="NO_LINE_ACCESS",
                field="block_type",
                severity="ERROR",
                message=(
                    "A POWER block isolates the OHE but does not stop traffic on the "
                    "running lines — line work needs a TRAFFIC or POWER_AND_TRAFFIC block."
                ),
            ))

        # Rule 4 — TDMS (traction) work under a pure traffic block is unsafe.
        if job.source_system == "TDMS" and block_type == BlockType.TRAFFIC:
            reasons.append(ValidationMessage(
                code="TRACTION_UNDER_TRAFFIC",
                field="block_type",
                severity="ERROR",
                message="Traction (TRD) work under a plain TRAFFIC block leaves the OHE energised.",
            ))

        return BlockCompatibility(compatible=len(reasons) == 0, reasons=reasons)

    def feasible_block_types(self, job: MaintenanceJob) -> List[BlockType]:
        """All block types under which this job may lawfully be executed."""
        return [bt for bt in BlockType if self.check(job, bt).compatible]


def _covers(offered: BlockType, required: BlockType) -> bool:
    """Does the offered block type cover the required one?"""
    if offered == required:
        return True
    # The combined block covers everything.
    return offered == BlockType.POWER_AND_TRAFFIC
