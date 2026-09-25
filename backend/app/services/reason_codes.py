"""Centralized Reason Code Registry for Railway Block Planning.

Standardizes all deferral and infeasibility diagnostic reason codes used
across the optimization subsystem and UI explanation panels.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Set


class ReasonCode(str, Enum):
    """Canonical reason codes explaining why maintenance work was deferred or infeasible."""

    NO_FEASIBLE_WINDOW = "NO_FEASIBLE_WINDOW"
    TRAIN_CONFLICT = "TRAIN_CONFLICT"
    RESOURCE_CONFLICT = "RESOURCE_CONFLICT"
    ISOLATION_CONFLICT = "ISOLATION_CONFLICT"
    BLOCK_CAPACITY = "BLOCK_CAPACITY"
    INCOMPATIBLE_WORK = "INCOMPATIBLE_WORK"
    SECTION_RESTRICTION = "SECTION_RESTRICTION"
    LOCKED_ASSIGNMENT = "LOCKED_ASSIGNMENT"
    LOWER_PRIORITY = "LOWER_PRIORITY"

    # Backward compatibility alias
    INSUFFICIENT_WINDOW = "INSUFFICIENT_WINDOW"


# Re-export individual constants for ergonomic imports
NO_FEASIBLE_WINDOW: str = ReasonCode.NO_FEASIBLE_WINDOW.value
TRAIN_CONFLICT: str = ReasonCode.TRAIN_CONFLICT.value
RESOURCE_CONFLICT: str = ReasonCode.RESOURCE_CONFLICT.value
ISOLATION_CONFLICT: str = ReasonCode.ISOLATION_CONFLICT.value
BLOCK_CAPACITY: str = ReasonCode.BLOCK_CAPACITY.value
INCOMPATIBLE_WORK: str = ReasonCode.INCOMPATIBLE_WORK.value
SECTION_RESTRICTION: str = ReasonCode.SECTION_RESTRICTION.value
LOCKED_ASSIGNMENT: str = ReasonCode.LOCKED_ASSIGNMENT.value
LOWER_PRIORITY: str = ReasonCode.LOWER_PRIORITY.value

# Backward compatibility constant
INSUFFICIENT_WINDOW: str = ReasonCode.INSUFFICIENT_WINDOW.value

# Descriptions for human-readable metadata
REASON_DESCRIPTIONS: Dict[str, str] = {
    NO_FEASIBLE_WINDOW: "No safe or accessible possession window exists on the target corridor.",
    TRAIN_CONFLICT: "Protected train movements occupy the corridor and prevent scheduling.",
    RESOURCE_CONFLICT: "Required specialized machinery, crews, or tower wagons are unavailable or booked.",
    ISOLATION_CONFLICT: "OHE traction power isolation requirements conflict with the window electrical status.",
    BLOCK_CAPACITY: "Available window duration is insufficient for the protected work duration.",
    INCOMPATIBLE_WORK: "Simultaneous possession execution violates safety separation or work method rules.",
    SECTION_RESTRICTION: "Line configuration or single-line operation restrictions prevent concurrent possession.",
    LOCKED_ASSIGNMENT: "Pre-sanctioned or locked block assignments prevent rescheduling.",
    LOWER_PRIORITY: "Corridor capacity was allocated to higher-tier emergency or safety-critical maintenance.",
    INSUFFICIENT_WINDOW: "Available window duration is insufficient for the protected work duration.",
}

CANONICAL_REASON_CODES: List[str] = [
    NO_FEASIBLE_WINDOW,
    TRAIN_CONFLICT,
    RESOURCE_CONFLICT,
    ISOLATION_CONFLICT,
    BLOCK_CAPACITY,
    INCOMPATIBLE_WORK,
    SECTION_RESTRICTION,
    LOCKED_ASSIGNMENT,
    LOWER_PRIORITY,
]
