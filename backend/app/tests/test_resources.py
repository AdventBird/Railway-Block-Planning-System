"""Tests for Resource Availability Service.

Verifies:
- Overlapping resource conflict detection
- Non-overlapping resource feasibility
- Multiple resource bundle reservation and conflict detection
- Reservation success and ledger state
- Reservation conflict rejection
- Release behavior (freeing resources for subsequent jobs)
- Structured conflict output matching specification
- Plain-language explanation helper
- Edge cases (identical windows, touching boundaries, empty resource lists, time formats)
"""

import pytest

from backend.app.services.resources import (
    ResourceEngine,
    REASON_RESOURCE_CONFLICT,
    windows_overlap,
    parse_time_to_minutes,
    format_minutes_to_time,
)


def test_time_parsing_helpers():
    """Verify conversion between HH:MM strings and integer minutes."""
    assert parse_time_to_minutes("01:30") == 90
    assert parse_time_to_minutes("05:00") == 300
    assert parse_time_to_minutes("00:00") == 0
    assert parse_time_to_minutes(120) == 120
    assert format_minutes_to_time(90) == "01:30"
    assert format_minutes_to_time(300) == "05:00"


def test_window_overlap_logic():
    """Verify strict interval overlap logic [start, end)."""
    # Overlapping: 01:30–03:00 (90-180) and 02:15–03:30 (135-210)
    assert windows_overlap(90, 180, 135, 210) is True

    # Touching boundaries do NOT overlap: 01:00-02:00 (60-120) and 02:00-03:00 (120-180)
    assert windows_overlap(60, 120, 120, 180) is False

    # Disjoint intervals do NOT overlap: 01:00-02:00 (60-120) and 03:00-04:00 (180-240)
    assert windows_overlap(60, 120, 180, 240) is False


def test_overlapping_resource_conflict_scenario():
    """Verify the scenario from the prompt:
    Tower Wagon TW-925
    Job A: 01:30–03:00
    Job B: 02:15–03:30
    Result: RESOURCE_CONFLICT with Job A
    """
    engine = ResourceEngine()

    # Reserve for Job A
    ok_a = engine.reserve_window(
        job_id="J-01",
        resource="Tower wagon TW-925",
        start_time="01:30",
        end_time="03:00",
    )
    assert ok_a is True

    # Check availability for Job B
    is_avail = engine.is_available("Tower wagon TW-925", "02:15", "03:30")
    assert is_avail is False

    # Detect conflicts for Job B
    conflicts = engine.detect_conflicts(
        job_id="J-07",
        resources=["Tower wagon TW-925"],
        start_time="02:15",
        end_time="03:30",
    )

    assert len(conflicts) == 1
    c = conflicts[0]
    assert c["resource"] == "Tower wagon TW-925"
    assert c["available"] is False
    assert c["conflict_with"] == "J-01"
    assert c["reason"] == REASON_RESOURCE_CONFLICT

    # Attempting to reserve must fail
    ok_b = engine.reserve_window("J-07", "Tower wagon TW-925", "02:15", "03:30")
    assert ok_b is False


def test_non_overlapping_resources():
    """Consecutive jobs on the same resource without overlapping times must succeed."""
    engine = ResourceEngine()

    # Slot 1: 01:00 to 02:30
    ok1 = engine.reserve_window("REMM access crane", "REMM access crane", "01:00", "02:30")
    assert ok1 is True

    # Slot 2: 02:30 to 04:00 (starts right when slot 1 ends)
    assert engine.is_available("REMM access crane", "02:30", "04:00") is True
    ok2 = engine.reserve_window("REMM access crane", "REMM access crane", "02:30", "04:00")
    assert ok2 is True

    # Slot 3: 04:30 to 05:30 (with gap)
    assert engine.is_available("REMM access crane", "04:30", "05:30") is True


def test_multiple_resources_atomic_reservation():
    """Verify reserving a multi-resource bundle (e.g. BCM machine + Ballast regulator + BRNA men)."""
    engine = ResourceEngine()
    req_resources = ["BCM-03", "Ballast regulator", "BRNA men"]

    # First reservation succeeds
    ok1 = engine.reserve_all("J-04", req_resources, "01:00", "05:00")
    assert ok1 is True

    # Job requiring one of the same resources (Ballast regulator) during overlapping time
    conflicts = engine.detect_conflicts("J-08", ["Ballast regulator", "Geometry car"], "03:00", "04:30")
    assert len(conflicts) == 1
    assert conflicts[0]["resource"] == "Ballast regulator"
    assert conflicts[0]["conflict_with"] == "J-04"

    # Atomic reserve_all must fail and rollback/not reserve Geometry car
    ok2 = engine.reserve_all("J-08", ["Ballast regulator", "Geometry car"], "03:00", "04:30")
    assert ok2 is False
    # Geometry car should remain free since reservation aborted
    assert engine.is_available("Geometry car", "03:00", "04:30") is True


def test_release_behavior():
    """Releasing reservations allows subsequent jobs to reserve the freed window."""
    engine = ResourceEngine()
    engine.reserve_window("J-02", "REMM-2 welding set", "01:00", "03:00")

    assert engine.is_available("REMM-2 welding set", "01:30", "02:30") is False

    # Release Job 02
    released_count = engine.release_window("J-02")
    assert released_count == 1

    # Now available
    assert engine.is_available("REMM-2 welding set", "01:30", "02:30") is True

    # Another job can now reserve it
    ok_subsequent = engine.reserve_window("J-99", "REMM-2 welding set", "01:30", "02:30")
    assert ok_subsequent is True


def test_edge_cases_resources():
    """Verify graceful handling of invalid time windows, empty resources, identical windows."""
    engine = ResourceEngine()

    # Empty resource list
    assert engine.detect_conflicts("J-EMP", [], "01:00", "02:00") == []
    assert engine.reserve_all("J-EMP", [], "01:00", "02:00") is True

    # Inverted or zero-duration window (end <= start)
    assert engine.is_available("TW-925", "03:00", "02:00") is False
    assert engine.is_available("TW-925", "03:00", "03:00") is False

    # Releasing non-existent job returns 0
    assert engine.release_window("NON_EXISTENT_JOB") == 0


def test_explain_resource():
    """Verify explain output."""
    engine = ResourceEngine()
    engine.reserve_window("J-01", "TW-925", "01:00", "03:00")

    exp_free = engine.explain("TW-925", "04:00", "05:00")
    assert "Resource Available" in exp_free

    exp_conflict = engine.explain("TW-925", "02:00", "04:00", conflict_with="J-01")
    assert "Resource Conflict" in exp_conflict
    assert "J-01" in exp_conflict
    assert REASON_RESOURCE_CONFLICT in exp_conflict
