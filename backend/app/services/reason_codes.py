"""Backward-compatibility re-export of the canonical reason-code registry.

The SINGLE source of truth is ``backend.app.rules.reasons``. This module
exists only so older imports (``services.reason_codes``) keep working while
the codebase consolidates. Do not add new codes here.
"""

from __future__ import annotations

from backend.app.rules.reasons import (  # noqa: F401
    CODE_ORDER,
    REASON_DESCRIPTIONS,
    ReasonCode,
    UnscheduledResult,
    reason_code_catalogue,
    sort_codes,
)

# ---------------------------------------------------------------------------
# Flat constants (legacy ergonomic imports)
# ---------------------------------------------------------------------------

NO_FEASIBLE_WINDOW: str = ReasonCode.NO_FEASIBLE_WINDOW.value
TRAIN_CONFLICT: str = ReasonCode.TRAIN_CONFLICT.value
RESOURCE_CONFLICT: str = ReasonCode.RESOURCE_CONFLICT.value
ISOLATION_CONFLICT: str = ReasonCode.ISOLATION_CONFLICT.value
BLOCK_CAPACITY: str = ReasonCode.BLOCK_CAPACITY.value
INCOMPATIBLE_WORK: str = ReasonCode.INCOMPATIBLE_WORK.value
SECTION_RESTRICTION: str = ReasonCode.SECTION_RESTRICTION.value
LOCKED_ASSIGNMENT: str = ReasonCode.LOCKED_ASSIGNMENT.value
LOWER_PRIORITY: str = ReasonCode.LOWER_PRIORITY.value
PROTECTED_MOVEMENT_CONFLICT: str = ReasonCode.PROTECTED_MOVEMENT_CONFLICT.value

# Backward compatibility alias
INSUFFICIENT_WINDOW: str = ReasonCode.INSUFFICIENT_WINDOW.value

#: Descriptions keyed by plain string (legacy shape).
DESCRIPTIONS: dict = {
    code.value if hasattr(code, "value") else code: description
    for code, description in REASON_DESCRIPTIONS.items()
}

#: Legacy alias kept for old callers.
REASON_DESCRIPTIONS_BY_STRING = DESCRIPTIONS

CANONICAL_REASON_CODES: list = [code.value for code in ReasonCode]
