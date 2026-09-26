"""Tests for ReplanningEngine, Plan Alternatives, and Emergency Insertion.

Verifies:
- Feature 18: Plan Alternatives (SAFETY_FIRST, BALANCED, PUNCTUALITY_FIRST profiles)
- Feature 19: Event-Driven Replanning:
  - SPECIAL_TRAIN
  - TRAIN_CANCELLED
  - RESOURCE_FAILURE
  - WINDOW_REDUCED
  - WINDOW_WITHDRAWN
  - PRIORITY_CHANGE
  - OPERATIONAL_RESTRICTION
- Feature 20: Emergency Insertion:
  - Tier 0 precedence
  - Resource pre-emption
  - Locked assignments remain unchanged
- Version progression (r1 -> r2 -> r3)
- Audit diffing (changed, unchanged, newly deferred, newly scheduled)
- Determinism across repeated runs
"""

import pytest

from backend.app.services.objective import OptimizationMode
from backend.app.services.planner import Planner
from backend.app.services.priority import MaintenanceJob, Tier
from backend.app.services.replanning import EventType, ReplanningEngine, increment_plan_version


# ---------------------------------------------------------------------------
# Versioning Tests
# ---------------------------------------------------------------------------
def test_version_progression():
    """Verify clean immutable version progression."""
    assert increment_plan_version("r1") == "r2"
    assert increment_plan_version("r2") == "r3"
    assert increment_plan_version("v2026.09.15 · r1") == "v2026.09.15 · r2"


# ---------------------------------------------------------------------------
# Feature 18: Plan Alternatives Tests
# ---------------------------------------------------------------------------
def test_plan_alternatives_generation():
    """Verify all three required modes (SAFETY_FIRST, BALANCED, PUNCTUALITY_FIRST) are generated."""
    jobs = [
        MaintenanceJob(id="J-01", corridor_id="C1", duration_minutes=60, tier=Tier.TIER_1),
        MaintenanceJob(id="J-02", corridor_id="C1", duration_minutes=60, tier=Tier.TIER_4),
    ]
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"},
    ]
    trains = [
        {"id": "T-1", "corridorId": "C1", "start": "01:00", "end": "02:00", "isProtected": True},
    ]

    alternatives = ReplanningEngine.generate_alternatives(
        jobs=jobs,
        windows=windows,
        train_movements=trains,
    )

    assert "SAFETY_FIRST" in alternatives
    assert "BALANCED" in alternatives
    assert "PUNCTUALITY_FIRST" in alternatives

    for mode_name, result in alternatives.items():
        assert result["mode"] == mode_name
        assert result["status"] in ("OPTIMAL", "FEASIBLE")
        assert "assignments" in result
        assert "deferred_jobs" in result
        assert "metrics" in result
        assert "train_impacts" in result


# ---------------------------------------------------------------------------
# Feature 19: Event-Driven Replanning Tests
# ---------------------------------------------------------------------------
def test_replan_special_train_event():
    """SPECIAL_TRAIN introduces a new protected train path, displacing conflicting work."""
    planner = Planner(plan_version="r1")
    jobs = [
        MaintenanceJob(id="J-01", corridor_id="C1", duration_minutes=120, tier=Tier.TIER_2),
    ]
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"},
    ]

    # Baseline plan (J-01 is scheduled in W1)
    base_plan = planner.solve(jobs=jobs, windows=windows)
    assert len(base_plan.assignments) == 1

    # Event: Special Train VIP occupies 01:30–03:30, shrinking gap to 30 min (insufficient for 120 min job)
    event = {
        "type": EventType.SPECIAL_TRAIN.value,
        "payload": {
            "id": "T-VIP-99",
            "name": "Special Military Train",
            "corridorId": "C1",
            "start": "01:30",
            "end": "03:30",
        },
    }

    replan_res = ReplanningEngine.replan(
        current_plan=base_plan,
        current_jobs=jobs,
        windows=windows,
        event=event,
    )

    assert replan_res.plan_version == "r2"
    assert replan_res.trigger == EventType.SPECIAL_TRAIN.value
    # J-01 is newly deferred due to train conflict
    assert len(replan_res.newly_deferred_jobs) == 1
    assert replan_res.newly_deferred_jobs[0]["jobId"] == "J-01"
    assert "TRAIN_CONFLICT" in replan_res.reason_codes


def test_replan_train_cancelled_event():
    """TRAIN_CANCELLED removes train friction, allowing previously deferred work to be scheduled."""
    jobs = [
        MaintenanceJob(id="J-BLOCKED", corridor_id="C1", duration_minutes=120),
    ]
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"},
    ]
    trains = [
        {"id": "T-OBSTACLE", "corridorId": "C1", "start": "01:30", "end": "03:30", "isProtected": True},
    ]

    planner = Planner(plan_version="r1")
    base_plan = planner.solve(jobs=jobs, windows=windows, train_movements=trains)
    # Blocked in r1
    assert len(base_plan.assignments) == 0

    # Event: Train is cancelled
    event = {
        "type": EventType.TRAIN_CANCELLED.value,
        "payload": {"trainId": "T-OBSTACLE"},
    }

    replan_res = ReplanningEngine.replan(
        current_plan=base_plan,
        current_jobs=jobs,
        windows=windows,
        train_movements=trains,
        event=event,
    )

    assert replan_res.plan_version == "r2"
    # Now newly scheduled
    assert len(replan_res.newly_scheduled_jobs) == 1
    assert replan_res.newly_scheduled_jobs[0]["jobId"] == "J-BLOCKED"


def test_replan_resource_failure_event():
    """RESOURCE_FAILURE disables machine, deferring jobs that depend on it."""
    planner = Planner(plan_version="r1")
    jobs = [
        MaintenanceJob(id="J-CRANE", corridor_id="C1", duration_minutes=60, resources=["REMM access crane"]),
    ]
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 180}]

    base_plan = planner.solve(jobs=jobs, windows=windows)
    assert len(base_plan.assignments) == 1

    event = {
        "type": EventType.RESOURCE_FAILURE.value,
        "payload": {"resource": "REMM access crane"},
    }

    replan_res = ReplanningEngine.replan(
        current_plan=base_plan,
        current_jobs=jobs,
        windows=windows,
        event=event,
    )

    assert replan_res.plan_version == "r2"
    assert len(replan_res.newly_deferred_jobs) == 1
    assert replan_res.newly_deferred_jobs[0]["jobId"] == "J-CRANE"


def test_replan_window_reduced_event():
    """WINDOW_REDUCED shrinks capacity, pushing out jobs that no longer fit."""
    planner = Planner(plan_version="r1")
    job = MaintenanceJob(id="J-BCM", corridor_id="C1", duration_minutes=150)
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 240, "start": "01:00", "end": "05:00"}]

    base_plan = planner.solve(jobs=[job], windows=windows)
    assert len(base_plan.assignments) == 1

    # Window reduced to 100 min (cannot accommodate 150 + buffer = 180 min)
    event = {
        "type": EventType.WINDOW_REDUCED.value,
        "payload": {"windowId": "W1", "minutes": 100, "end": "02:40"},
    }

    replan_res = ReplanningEngine.replan(
        current_plan=base_plan,
        current_jobs=[job],
        windows=windows,
        event=event,
    )

    assert len(replan_res.newly_deferred_jobs) == 1
    assert replan_res.newly_deferred_jobs[0]["jobId"] == "J-BCM"


def test_replan_window_withdrawn_event():
    """WINDOW_WITHDRAWN removes window entirely."""
    planner = Planner(plan_version="r1")
    job = MaintenanceJob(id="J-01", corridor_id="C1", duration_minutes=60)
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 180}]

    base_plan = planner.solve(jobs=[job], windows=windows)
    assert len(base_plan.assignments) == 1

    event = {
        "type": EventType.WINDOW_WITHDRAWN.value,
        "payload": {"windowId": "W1"},
    }

    replan_res = ReplanningEngine.replan(
        current_plan=base_plan,
        current_jobs=[job],
        windows=windows,
        event=event,
    )

    assert len(replan_res.newly_deferred_jobs) == 1


def test_replan_priority_change_event():
    """PRIORITY_CHANGE elevates routine work to Tier 1, winning over competing jobs."""
    planner = Planner(plan_version="r1")
    job_t2 = MaintenanceJob(id="J-T2", corridor_id="C1", duration_minutes=100, tier=Tier.TIER_2)
    job_t4 = MaintenanceJob(id="J-T4", corridor_id="C1", duration_minutes=100, tier=Tier.TIER_4)
    # Window can only fit 1 of the two jobs
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 150}]

    base_plan = planner.solve(jobs=[job_t2, job_t4], windows=windows)
    assert base_plan.assignments[0]["jobId"] == "J-T2"

    # Event: J-T4 is promoted to Tier 1
    event = {
        "type": EventType.PRIORITY_CHANGE.value,
        "payload": {"jobId": "J-T4", "tier": Tier.TIER_1},
    }

    replan_res = ReplanningEngine.replan(
        current_plan=base_plan,
        current_jobs=[job_t2, job_t4],
        windows=windows,
        event=event,
    )

    # Now J-T4 is scheduled, and J-T2 is deferred
    assigned_ids = [a["jobId"] for a in replan_res.assignments]
    assert "J-T4" in assigned_ids
    assert len(replan_res.newly_deferred_jobs) == 1
    assert replan_res.newly_deferred_jobs[0]["jobId"] == "J-T2"


def test_replan_operational_restriction_event():
    """OPERATIONAL_RESTRICTION forbids power isolation, deferring dependent OHE jobs."""
    planner = Planner(plan_version="r1")
    job_ohe = MaintenanceJob(id="J-OHE", corridor_id="C1", duration_minutes=60, needs_power_isolation=True)
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 180, "allowsPowerIsolation": True}]

    base_plan = planner.solve(jobs=[job_ohe], windows=windows)
    assert len(base_plan.assignments) == 1

    event = {
        "type": EventType.OPERATIONAL_RESTRICTION.value,
        "payload": {"corridorId": "C1", "forbidPowerIsolation": True},
    }

    replan_res = ReplanningEngine.replan(
        current_plan=base_plan,
        current_jobs=[job_ohe],
        windows=windows,
        event=event,
    )

    assert len(replan_res.newly_deferred_jobs) == 1
    assert "ISOLATION_CONFLICT" in replan_res.reason_codes


# ---------------------------------------------------------------------------
# Feature 20: Emergency Insertion Tests
# ---------------------------------------------------------------------------
def test_emergency_insertion_workflow():
    """Emergency job receives Tier 0 precedence, displacing routine work while respecting locked jobs.

    Capacity is tight: locked 40 + emergency 70 = 110 min in a 120-min
    window, so the emergency and the locked job fit but the routine job is
    displaced — displacement computed by CP-SAT, not asserted.
    """
    planner = Planner(plan_version="r1")

    job_locked = MaintenanceJob(id="J-LOCKED", corridor_id="C1", duration_minutes=40, tier=Tier.TIER_2)
    job_routine = MaintenanceJob(id="J-ROUTINE", corridor_id="C1", duration_minutes=50, tier=Tier.TIER_3)

    windows = [{"id": "W1", "corridorId": "C1", "minutes": 120}]
    locked = {"J-LOCKED": "W1"}

    base_plan = planner.solve(
        jobs=[job_locked, job_routine],
        windows=windows,
        locked_assignments=locked,
    )
    assert len(base_plan.assignments) == 2

    # Emergency fracture defect inserted into W1
    emergency_job = MaintenanceJob(
        id="J-EMERGENCY-FRACTURE",
        title="Rail fracture repair",
        corridor_id="C1",
        duration_minutes=70,
        severity="EMERGENCY",
    )

    replan_res = ReplanningEngine.emergency_insertion(
        current_plan=base_plan,
        emergency_job=emergency_job,
        current_jobs=[job_locked, job_routine],
        windows=windows,
        locked_assignments=locked,
        target_window_id="W1",
    )

    assert replan_res.plan_version == "r2"
    assert replan_res.trigger == EventType.EMERGENCY_JOB.value

    assigned_ids = [a["jobId"] for a in replan_res.assignments]
    assert "J-EMERGENCY-FRACTURE" in assigned_ids
    # J-LOCKED remained fixed
    assert "J-LOCKED" in assigned_ids
    # J-ROUTINE was displaced/deferred due to emergency capacity consumption
    assert "J-ROUTINE" not in assigned_ids
    assert len(replan_res.newly_deferred_jobs) == 1
    assert replan_res.newly_deferred_jobs[0]["jobId"] == "J-ROUTINE"


def test_replanning_determinism():
    """Consecutive replanning executions produce 100% identical outputs."""
    planner = Planner(plan_version="r1")
    jobs = [
        MaintenanceJob(id="J-01", corridor_id="C1", duration_minutes=60, tier=Tier.TIER_1),
        MaintenanceJob(id="J-02", corridor_id="C1", duration_minutes=60, tier=Tier.TIER_2),
    ]
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 180}]
    base_plan = planner.solve(jobs=jobs, windows=windows)

    event = {
        "type": EventType.SPECIAL_TRAIN.value,
        "payload": {
            "id": "T-DET",
            "corridorId": "C1",
            "start": "02:00",
            "end": "03:00",
        },
    }

    res1 = ReplanningEngine.replan(base_plan, jobs, windows, event).to_dict()
    res2 = ReplanningEngine.replan(base_plan, jobs, windows, event).to_dict()

    # Omit timestamp for strict equality
    res1.pop("timestamp")
    res2.pop("timestamp")

    assert res1 == res2
