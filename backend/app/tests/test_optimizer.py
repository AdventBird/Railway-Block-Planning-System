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
    """Two jobs whose combined possession (setup+work+restore) exceeds window
capacity cannot both be scheduled — capacity is enforced on real intervals."""
    optimizer = CpSatOptimizer()

    # Window of 120 minutes
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 120, "start": "01:00", "end": "03:00"}]

    # Each job: 50 min work + 15 setup + 15 restore = 80 min possession.
    # 80 + 80 = 160 min > 120 min window capacity.
    job1 = MaintenanceJob(
        id="J-01", corridor_id="C1", duration_minutes=50,
        setup_duration_minutes=15, restore_duration_minutes=15, tier=Tier.TIER_1,
    )
    job2 = MaintenanceJob(
        id="J-02", corridor_id="C1", duration_minutes=50,
        setup_duration_minutes=15, restore_duration_minutes=15, tier=Tier.TIER_2,
    )

    solution = optimizer.optimize(jobs=[job1, job2], windows=windows)

    assert solution.status in ("OPTIMAL", "FEASIBLE")
    # Only 1 job fits, the other is deferred
    assert len(solution.assigned_jobs) == 1
    assert len(solution.deferred_job_ids) == 1
    # Higher priority (Tier 1 J-01) should win over Tier 2 J-02
    assert solution.assigned_jobs[0]["jobId"] == "J-01"
    assert solution.deferred_job_ids[0] == "J-02"


def test_sequential_jobs_share_window_by_time():
    """Real interval placement: two 50-min jobs fit a 120-min window
    sequentially (50+50 <= 120) — the whole-window model could not do this."""
    optimizer = CpSatOptimizer()
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 120, "start": "01:00", "end": "03:00"}]
    job1 = MaintenanceJob(id="J-01", corridor_id="C1", duration_minutes=50, tier=Tier.TIER_1)
    job2 = MaintenanceJob(id="J-02", corridor_id="C1", duration_minutes=50, tier=Tier.TIER_2)

    solution = optimizer.optimize(jobs=[job1, job2], windows=windows)

    assert len(solution.assigned_jobs) == 2
    ends = [int(a["end_minutes"]) for a in solution.assigned_jobs]
    starts = [int(a["start_minutes"]) for a in solution.assigned_jobs]
    # disjoint intervals inside the window
    assert min(ends) <= max(starts) or max(ends) <= min(starts)
    for a in solution.assigned_jobs:
        assert int(a["end_minutes"]) - int(a["start_minutes"]) == 50


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


def test_resource_conflict_uses_actual_intervals():
    """Phase 4: shared-resource conflicts depend on ACTUAL JOB intervals.

    Two overlapping windows do NOT by themselves create a resource conflict:
    when the job intervals are disjoint (W1 01:00–03:00 holds 01:00–02:00,
    W2 01:30–03:30 holds 02:30–03:30) the same machine serves both jobs.
    Only genuinely overlapping job intervals collide.
    """
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
    # Both fit: their 60-min intervals can be placed disjointly even though
    # the windows overlap — window overlap alone is not a conflict.
    assert len(solution.assigned_jobs) == 2
    s1 = next(a for a in solution.assigned_jobs if a["jobId"] == "J-TOW-1")
    s2 = next(a for a in solution.assigned_jobs if a["jobId"] == "J-TOW-2")
    assert int(s1["end_minutes"]) <= int(s2["start_minutes"]) or int(s2["end_minutes"]) <= int(s1["start_minutes"])


def test_resource_conflict_forbidden_when_intervals_overlap():
    """Phase 4 converse: when the job intervals MUST overlap (each job fills
    its window), the shared resource allows only one of them."""
    optimizer = CpSatOptimizer()

    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 120, "start": "01:00", "end": "03:00"},
        {"id": "W2", "corridorId": "C2", "minutes": 120, "start": "01:30", "end": "03:30"},
    ]

    job1 = MaintenanceJob(
        id="J-TOW-1",
        corridor_id="C1",
        duration_minutes=110,  # fills W1: interval must span ~01:00–02:50
        resources=["Tower wagon TW-925"],
        tier=Tier.TIER_1,
    )
    job2 = MaintenanceJob(
        id="J-TOW-2",
        corridor_id="C2",
        duration_minutes=110,  # fills W2: interval must span ~01:40–03:30
        resources=["Tower wagon TW-925"],
        tier=Tier.TIER_2,
    )

    solution = optimizer.optimize(jobs=[job1, job2], windows=windows)

    assert solution.status in ("OPTIMAL", "FEASIBLE")
    # The 110-min intervals must overlap (windows overlap by 90 min), so the
    # single tower wagon can only serve one job.
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


def test_compatible_parallel_jobs_run_simultaneously():
    """Phase 2 (CRITICAL): COMPATIBLE + PARALLEL jobs may genuinely overlap in
    time — no blanket NoOverlap may force them apart. Example from the brief:
    J-02 02:00–02:40 and J-09 02:00–02:30 are both valid parallel activities.
    """
    optimizer = CpSatOptimizer()

    windows = [{"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"}]

    job_a = MaintenanceJob(id="J-A", corridor_id="C1", duration_minutes=40, tier=Tier.TIER_1)
    job_b = MaintenanceJob(id="J-B", corridor_id="C1", duration_minutes=30, tier=Tier.TIER_2)

    compat_groups = [
        {
            "id": "CG-PAR-1",
            "status": "COMPATIBLE",
            "execution": "PARALLEL",
            "jobIds": ["J-A", "J-B"],
        }
    ]

    solution = optimizer.optimize(
        jobs=[job_a, job_b],
        windows=windows,
        compat_groups=compat_groups,
    )

    assert solution.status in ("OPTIMAL", "FEASIBLE")
    assert len(solution.assigned_jobs) == 2
    a = next(x for x in solution.assigned_jobs if x["jobId"] == "J-A")
    b = next(x for x in solution.assigned_jobs if x["jobId"] == "J-B")
    # The intervals genuinely overlap — neither job waits for the other.
    assert int(a["start_minutes"]) < int(b["end_minutes"])
    assert int(b["start_minutes"]) < int(a["end_minutes"])
    # execution mode is reported honestly per assignment
    assert a["parallel"] is True and b["parallel"] is True


def test_parallel_pairs_without_group_stay_sequential():
    """Without a COMPATIBLE/PARALLEL verdict, co-window jobs default to
    sequential execution inside the possession (safe rulebook default)."""
    optimizer = CpSatOptimizer()

    windows = [{"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"}]
    job_a = MaintenanceJob(id="J-A", corridor_id="C1", duration_minutes=40, tier=Tier.TIER_1)
    job_b = MaintenanceJob(id="J-B", corridor_id="C1", duration_minutes=30, tier=Tier.TIER_2)

    solution = optimizer.optimize(jobs=[job_a, job_b], windows=windows)

    assert len(solution.assigned_jobs) == 2
    a = next(x for x in solution.assigned_jobs if x["jobId"] == "J-A")
    b = next(x for x in solution.assigned_jobs if x["jobId"] == "J-B")
    # disjoint intervals: one finishes before the other starts
    assert int(a["end_minutes"]) <= int(b["start_minutes"]) or int(b["end_minutes"]) <= int(a["start_minutes"])


def test_conditional_pair_ordered_when_assigned_together():
    """Phase 3 (CRITICAL): when a CONDITIONAL pair is assigned to the same
    window, the ordering constraint MUST activate — A.end + handover <= B.start.
    The old model used a free Boolean the solver could set false; the constraint
    is now reified by the assignment literals themselves.
    """
    optimizer = CpSatOptimizer()

    # One 300-min window: both jobs fit only if ordered (75 + 75 + 10 <= 300).
    windows = [{"id": "W1", "corridorId": "C3", "minutes": 300, "start": "01:00", "end": "06:00"}]

    job_first = MaintenanceJob(id="J-FIRST", corridor_id="C3", duration_minutes=60, setup_duration_minutes=10, restore_duration_minutes=5, tier=Tier.TIER_1)
    job_second = MaintenanceJob(id="J-SECOND", corridor_id="C3", duration_minutes=60, setup_duration_minutes=10, restore_duration_minutes=5, tier=Tier.TIER_2)

    compat_groups = [
        {
            "id": "CG-COND-1",
            "status": "CONDITIONAL",
            "before": "J-FIRST",
            "after": "J-SECOND",
            "handover_minutes": 15,
            "jobIds": ["J-FIRST", "J-SECOND"],
        }
    ]

    solution = optimizer.optimize(
        jobs=[job_first, job_second],
        windows=windows,
        compat_groups=compat_groups,
    )

    assert solution.status in ("OPTIMAL", "FEASIBLE")
    assert len(solution.assigned_jobs) == 2
    first = next(x for x in solution.assigned_jobs if x["jobId"] == "J-FIRST")
    second = next(x for x in solution.assigned_jobs if x["jobId"] == "J-SECOND")
    # strict ordering with handover, enforced inside the same possession
    assert int(first["end_minutes"]) + 15 <= int(second["start_minutes"])


def test_conditional_no_ordering_when_not_together():
    """Phase 3 converse: a CONDITIONAL pair assigned to DIFFERENT windows
    carries no unnecessary ordering constraint — both are still schedulable."""
    optimizer = CpSatOptimizer()

    windows = [
        {"id": "W1", "corridorId": "C3", "minutes": 120, "start": "01:00", "end": "03:00"},
        {"id": "W2", "corridorId": "C3", "minutes": 120, "start": "04:00", "end": "06:00"},
    ]

    job_first = MaintenanceJob(id="J-FIRST", corridor_id="C3", duration_minutes=60, tier=Tier.TIER_1)
    job_second = MaintenanceJob(id="J-SECOND", corridor_id="C3", duration_minutes=60, tier=Tier.TIER_2)

    compat_groups = [
        {
            "id": "CG-COND-2",
            "status": "CONDITIONAL",
            "before": "J-FIRST",
            "after": "J-SECOND",
            "handover_minutes": 15,
            "jobIds": ["J-FIRST", "J-SECOND"],
        }
    ]

    solution = optimizer.optimize(
        jobs=[job_first, job_second],
        windows=windows,
        compat_groups=compat_groups,
    )

    assert solution.status in ("OPTIMAL", "FEASIBLE")
    assert len(solution.assigned_jobs) == 2
    first = next(x for x in solution.assigned_jobs if x["jobId"] == "J-FIRST")
    second = next(x for x in solution.assigned_jobs if x["jobId"] == "J-SECOND")
    assert first["windowId"] != second["windowId"]


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
