"""Tests for CpSatOptimizer.

Verifies:
- Compatibility constraints (mutually exclusive incompatible jobs)
- Resource constraints (shared machinery contention prevents concurrent allocation)
- Train constraints (protected train movements block scheduling)
- Possession duration (window capacity limit strictly enforced)
- Locked assignments (fixed jobs remain locked in specified windows)
"""

import pytest

from backend.app.services.optimizer import CpSatOptimizer
from backend.app.services.priority import MaintenanceJob, Tier


def test_possession_duration_constraint():
    """Two jobs whose combined protected duration exceeds window capacity cannot both be scheduled."""
    optimizer = CpSatOptimizer()

    # Window of 120 minutes
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 120, "start": "01:00", "end": "03:00"}]

    # Job 1: 50 min duration + 30 min default buffer = 80 min protected
    # Job 2: 50 min duration + 30 min default buffer = 80 min protected
    # 80 + 80 = 160 min > 120 min window capacity
    job1 = MaintenanceJob(id="J-01", corridor_id="C1", duration_minutes=50, tier=Tier.TIER_1)
    job2 = MaintenanceJob(id="J-02", corridor_id="C1", duration_minutes=50, tier=Tier.TIER_2)

    solution = optimizer.optimize(jobs=[job1, job2], windows=windows)

    assert solution.status in ("OPTIMAL", "FEASIBLE")
    # Only 1 job fits, the other is deferred
    assert len(solution.assigned_jobs) == 1
    assert len(solution.deferred_job_ids) == 1
    # Higher priority (Tier 1 J-01) should win over Tier 2 J-02
    assert solution.assigned_jobs[0]["jobId"] == "J-01"
    assert solution.deferred_job_ids[0] == "J-02"


def test_compatibility_constraint():
    """Incompatible jobs cannot be scheduled in the same window."""
    optimizer = CpSatOptimizer()

    windows = [{"id": "W1", "corridorId": "C1", "minutes": 300, "start": "01:00", "end": "06:00"}]

    job1 = MaintenanceJob(id="J-BCM", corridor_id="C1", duration_minutes=60, tier=Tier.TIER_1)
    job2 = MaintenanceJob(id="J-CABLE", corridor_id="C1", duration_minutes=60, tier=Tier.TIER_2)

    compat_groups = [
        {
            "id": "CG-3",
            "title": "BCM + Cable Inspection",
            "status": "Incompatible",
            "jobIds": ["J-BCM", "J-CABLE"],
        }
    ]

    solution = optimizer.optimize(
        jobs=[job1, job2],
        windows=windows,
        compat_groups=compat_groups,
    )

    assert solution.status in ("OPTIMAL", "FEASIBLE")
    assert len(solution.assigned_jobs) == 1
    assert solution.assigned_jobs[0]["jobId"] == "J-BCM"
    assert "J-CABLE" in solution.deferred_job_ids


def test_resource_conflict_constraint():
    """Two jobs requiring the same shared resource cannot share overlapping windows."""
    optimizer = CpSatOptimizer()

    # Two windows that overlap in time (01:00 to 03:00 and 01:30 to 03:30)
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 120, "start": "01:00", "end": "03:00"},
        {"id": "W2", "corridorId": "C2", "minutes": 120, "start": "01:30", "end": "03:30"},
    ]

    job1 = MaintenanceJob(
        id="J-TOW-1",
        corridor_id="C1",
        duration_minutes=60,
        resources=["Tower wagon TW-925"],
        tier=Tier.TIER_1,
    )
    job2 = MaintenanceJob(
        id="J-TOW-2",
        corridor_id="C2",
        duration_minutes=60,
        resources=["Tower wagon TW-925"],
        tier=Tier.TIER_2,
    )

    solution = optimizer.optimize(jobs=[job1, job2], windows=windows)

    assert solution.status in ("OPTIMAL", "FEASIBLE")
    # Both cannot be scheduled simultaneously because TW-925 cannot be in two places at once
    assert len(solution.assigned_jobs) == 1
    assert solution.assigned_jobs[0]["jobId"] == "J-TOW-1"
    assert "J-TOW-2" in solution.deferred_job_ids


def test_train_conflict_constraint():
    """Protected train movements blocking a window prevent scheduling on that corridor."""
    optimizer = CpSatOptimizer()

    windows = [{"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"}]
    train_movements = [
        {
            "id": "T-RAJ",
            "name": "Rajdhani Express",
            "corridorId": "C1",
            "start": "01:30",
            "end": "03:30",
            "isProtected": True,
        }
    ]

    # Job needs 120 min duration + 30 min buffer = 150 min. Available gaps around train are only 30 min.
    job = MaintenanceJob(id="J-01", corridor_id="C1", duration_minutes=120)

    solution = optimizer.optimize(
        jobs=[job],
        windows=windows,
        train_movements=train_movements,
    )

    assert solution.status in ("OPTIMAL", "FEASIBLE")
    assert len(solution.assigned_jobs) == 0
    assert "J-01" in solution.deferred_job_ids


def test_locked_assignment_constraint():
    """Locked assignments are strictly respected by the optimizer."""
    optimizer = CpSatOptimizer()

    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"},
        {"id": "W2", "corridorId": "C1", "minutes": 180, "start": "04:00", "end": "07:00"},
    ]

    job = MaintenanceJob(id="J-LOCKED", corridor_id="C1", duration_minutes=60)
    locked = {"J-LOCKED": "W2"}

    solution = optimizer.optimize(
        jobs=[job],
        windows=windows,
        locked_assignments=locked,
    )

    assert solution.status in ("OPTIMAL", "FEASIBLE")
    assert len(solution.assigned_jobs) == 1
    assert solution.assigned_jobs[0]["jobId"] == "J-LOCKED"
    assert solution.assigned_jobs[0]["windowId"] == "W2"
