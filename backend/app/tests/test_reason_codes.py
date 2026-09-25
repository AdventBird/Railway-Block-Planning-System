"""Tests for Centralized Reason Code Registry.

Verifies:
- Every canonical reason code exists
- No duplicate codes in registry
- Enums and string constants remain stable
- Reason descriptions exist for all canonical codes
"""

import pytest

from backend.app.services.reason_codes import (
    BLOCK_CAPACITY,
    CANONICAL_REASON_CODES,
    INCOMPATIBLE_WORK,
    INSUFFICIENT_WINDOW,
    ISOLATION_CONFLICT,
    LOCKED_ASSIGNMENT,
    LOWER_PRIORITY,
    NO_FEASIBLE_WINDOW,
    REASON_DESCRIPTIONS,
    RESOURCE_CONFLICT,
    ReasonCode,
    SECTION_RESTRICTION,
    TRAIN_CONFLICT,
)


def test_every_canonical_reason_exists():
    """Verify that all 9 required canonical reason codes are defined."""
    expected_codes = [
        "NO_FEASIBLE_WINDOW",
        "TRAIN_CONFLICT",
        "RESOURCE_CONFLICT",
        "ISOLATION_CONFLICT",
        "BLOCK_CAPACITY",
        "INCOMPATIBLE_WORK",
        "SECTION_RESTRICTION",
        "LOCKED_ASSIGNMENT",
        "LOWER_PRIORITY",
    ]

    for code in expected_codes:
        assert hasattr(ReasonCode, code), f"ReasonCode enum missing {code}"
        assert getattr(ReasonCode, code).value == code


def test_no_duplicate_codes():
    """Verify that all canonical codes are unique."""
    unique_codes = set(CANONICAL_REASON_CODES)
    assert len(unique_codes) == len(CANONICAL_REASON_CODES)


def test_constants_match_enum_values():
    """Verify individual module constants match Enum values."""
    assert NO_FEASIBLE_WINDOW == ReasonCode.NO_FEASIBLE_WINDOW.value
    assert TRAIN_CONFLICT == ReasonCode.TRAIN_CONFLICT.value
    assert RESOURCE_CONFLICT == ReasonCode.RESOURCE_CONFLICT.value
    assert ISOLATION_CONFLICT == ReasonCode.ISOLATION_CONFLICT.value
    assert BLOCK_CAPACITY == ReasonCode.BLOCK_CAPACITY.value
    assert INCOMPATIBLE_WORK == ReasonCode.INCOMPATIBLE_WORK.value
    assert SECTION_RESTRICTION == ReasonCode.SECTION_RESTRICTION.value
    assert LOCKED_ASSIGNMENT == ReasonCode.LOCKED_ASSIGNMENT.value
    assert LOWER_PRIORITY == ReasonCode.LOWER_PRIORITY.value


def test_descriptions_exist_for_all_codes():
    """Verify human-readable descriptions exist for each canonical code."""
    for code in CANONICAL_REASON_CODES:
        assert code in REASON_DESCRIPTIONS
        assert len(REASON_DESCRIPTIONS[code]) > 10
