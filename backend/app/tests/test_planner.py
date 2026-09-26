"""Tests for the Planner Orchestrator Service.

Verifies:
- Feasible planning with CP-SAT solver (OPTIMAL status, valid assignments)
- Deferred jobs with diagnostic reason codes
- Complete PlannerResult structure and metrics calculation
- Required Scenario 1: Feasible schedule
- Required Scenario 2: Locked assignment fixed in place
- Required Scenario 3: Train conflict deferral
- Required Scenario 4: Resource conflict deferral
- Required Scenario 5: Deterministic output across consecutive runs
"""

import pytest

from backend.app.services.diagnostics import REASON_RESOURCE_CONFLICT, REASON_TRAIN_CONFLICT
from backend.app.services.planner import Planner, PlannerResult
from backend.app.services.priority import MaintenanceJob, Tier


def test_scenario_1_feasible_schedule():
    """Scenario 1: Feasible schedule returns OPTIMAL and valid assignments."""
    planner = Planner(plan_version="r1")

    jobs = [
        MaintenanceJob(id="J-01", corridor_id="C1", duration_minutes=60, tier=Tier.TIER_1),
        MaintenanceJob(id="J-02", corridor_id="C2", duration_minutes=90, tier=Tier.TIER_2),
    ]
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"},
        {"id": "W2", "corridorId": "C2", "minutes": 240, "start": "01:30", "end": "05:30"},
    ]

    result = planner.solve(jobs=jobs, windows=windows)

    assert result.status == "OPTIMAL"
    assert result.plan_version == "r1"
    assert len(result.assignments) == 2
    assert len(result.deferred_jobs) == 0

    assigned_ids = [a["jobId"] for a in result.assignments]
    assert "J-01" in assigned_ids
    assert "J-02" in assigned_ids

    # Metrics verification
    assert result.metrics["jobs"] == 2
    assert result.metrics["scheduled"] == 2
    assert result.metrics["deferred"] == 0
    assert result.metrics["blocks"] == 2
    assert result.metrics["utilization"] > 0


def test_scenario_2_locked_assignment():
    """Scenario 2: Locked work remains fixed in the specified window."""
    planner = Planner()

    jobs = [
        MaintenanceJob(id="J-LOCK", corridor_id="C1", duration_minutes=60, tier=Tier.TIER_3),
        MaintenanceJob(id="J-OTHER", corridor_id="C1", duration_minutes=60, tier=Tier.TIER_1),
    ]
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"},
        {"id": "W2", "corridorId": "C1", "minutes": 180, "start": "04:00", "end": "07:00"},
    ]

    # Force J-LOCK into W2
    result = planner.solve(
        jobs=jobs,
        windows=windows,
        locked_assignments={"J-LOCK": "W2"},
    )

    assert result.status == "OPTIMAL"
    lock_assign = next(a for a in result.assignments if a["jobId"] == "J-LOCK")
    assert lock_assign["windowId"] == "W2"


def test_scenario_3_train_conflict():
    """Scenario 3: Protected train movement blocks window, causing deferred job with TRAIN_CONFLICT."""
    planner = Planner()

    jobs = [
        MaintenanceJob(id="J-BLOCKED", corridor_id="C1", duration_minutes=120),
    ]
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"},
    ]
    train_movements = [
        {
            "id": "T-VIP",
            "name": "02612 VIP Special",
            "corridorId": "C1",
            "start": "01:30",
            "end": "03:30",
            "isProtected": True,
        }
    ]

    result = planner.solve(
        jobs=jobs,
        windows=windows,
        train_movements=train_movements,
    )

    assert len(result.assignments) == 0
    assert len(result.deferred_jobs) == 1
    deferred = result.deferred_jobs[0]
    assert deferred["jobId"] == "J-BLOCKED"
    assert REASON_TRAIN_CONFLICT in deferred["reason_codes"]


def test_scenario_4_resource_conflict():
    """Tower wagon shared by two jobs in a 90-min window: the resource cannot
    run them concurrently and they cannot both fit sequentially, so the
    lower-priority job is deferred with RESOURCE_CONFLICT."""
    planner = Planner()

    # One window of 90 min on C1: 60+60 sequential does NOT fit.
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 90, "start": "01:00", "end": "02:30"},
    ]

    job_high = MaintenanceJob(
        id="J-HIGH",
        corridor_id="C1",
        duration_minutes=60,
        resources=["Tower wagon TW-925"],
        tier=Tier.TIER_1,
    )
    job_low = MaintenanceJob(
        id="J-LOW",
        corridor_id="C1",
        duration_minutes=60,
        resources=["Tower wagon TW-925"],
        tier=Tier.TIER_3,
    )

    result = planner.solve(
        jobs=[job_high, job_low],
        windows=windows,
    )

    assert len(result.assignments) == 1
    assert result.assignments[0]["jobId"] == "J-HIGH"
    assert len(result.deferred_jobs) == 1
    deferred = result.deferred_jobs[0]
    assert deferred["jobId"] == "J-LOW"
    assert REASON_RESOURCE_CONFLICT in deferred["reason_codes"]


def test_shared_resource_runs_sequentially_when_time_allows():
    """With real interval placement a shared resource can serve two jobs
    back-to-back inside one window (60+60 <= 120) — no conflict."""
    planner = Planner()
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 120, "start": "01:00", "end": "03:00"},
    ]
    job_high = MaintenanceJob(
        id="J-HIGH", corridor_id="C1", duration_minutes=60,
        resources=["Tower wagon TW-925"], tier=Tier.TIER_1,
    )
    job_low = MaintenanceJob(
        id="J-LOW", corridor_id="C1", duration_minutes=60,
        resources=["Tower wagon TW-925"], tier=Tier.TIER_3,
    )

    result = planner.solve(jobs=[job_high, job_low], windows=windows)

    assert len(result.assignments) == 2
    # intervals must be disjoint
    a1, a2 = result.assignments
    assert int(a2["end_minutes"]) <= int(a1["start_minutes"]) or int(a1["end_minutes"]) <= int(a2["start_minutes"])


def test_scenario_5_deterministic_output():
    """Scenario 5: Consecutive planner runs produce 100% identical outputs."""
    planner = Planner()

    jobs = [
        MaintenanceJob(id="J-01", corridor_id="C1", duration_minutes=60, tier=Tier.TIER_1),
        MaintenanceJob(id="J-02", corridor_id="C2", duration_minutes=90, tier=Tier.TIER_2),
        MaintenanceJob(id="J-03", corridor_id="C1", duration_minutes=150, tier=Tier.TIER_3),
    ]
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"},
        {"id": "W2", "corridorId": "C2", "minutes": 240, "start": "01:30", "end": "05:30"},
    ]

    res1 = planner.solve(jobs=jobs, windows=windows).to_dict()
    res2 = planner.solve(jobs=jobs, windows=windows).to_dict()

    assert res1["assignments"] == res2["assignments"]
    assert res1["deferred_jobs"] == res2["deferred_jobs"]
    assert res1["metrics"] == res2["metrics"]


def test_planner_infeasible_case():
    """Infeasible input (locked to missing window) returns structured INFEASIBLE result without crash."""
    planner = Planner()

    job = MaintenanceJob(id="J-FAIL", corridor_id="C1", duration_minutes=60)
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 180}]

    result = planner.solve(
        jobs=[job],
        windows=windows,
        locked_assignments={"J-FAIL": "NON_EXISTENT_WINDOW"},
    )

    assert result.status == "INFEASIBLE"
    assert len(result.assignments) == 0
    assert result.diagnostics is not None
    assert result.diagnostics["status"] == "INFEASIBLE"
