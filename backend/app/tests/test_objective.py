"""Tests for ObjectiveBuilder.

Verifies:
- Maintenance completion base reward
- Priority ordering bonuses (higher tier = higher reward)
- Fairness penalty integration (protecting starving departments)
- Window utilization bonus behavior
- Full objective matrix generation
"""

import pytest

from backend.app.services.fairness import FairnessEngine
from backend.app.services.objective import ObjectiveBuilder
from backend.app.services.priority import MaintenanceJob, Tier


def test_maintenance_score_base_reward():
    """Verify that every scheduled job receives a positive base reward."""
    builder = ObjectiveBuilder()
    job = MaintenanceJob(id="J-01", title="Basic job")
    reward = builder.maintenance_score(job)
    assert reward > 0


def test_priority_ordering_bonuses():
    """Verify higher priority tiers yield strictly higher reward bonuses."""
    builder = ObjectiveBuilder()

    job_t0 = MaintenanceJob(id="J-T0", tier=Tier.TIER_0, severity="EMERGENCY")
    job_t1 = MaintenanceJob(id="J-T1", tier=Tier.TIER_1, severity="CRITICAL")
    job_t2 = MaintenanceJob(id="J-T2", tier=Tier.TIER_2, overdue_age=2.0)
    job_t3 = MaintenanceJob(id="J-T3", tier=Tier.TIER_3, severity="MEDIUM")
    job_t4 = MaintenanceJob(id="J-T4", tier=Tier.TIER_4, severity="LOW")

    p0 = builder.priority_score(job_t0)
    p1 = builder.priority_score(job_t1)
    p2 = builder.priority_score(job_t2)
    p3 = builder.priority_score(job_t3)
    p4 = builder.priority_score(job_t4)

    assert p0 > p1 > p2 > p3 > p4


def test_fairness_backlog_penalty():
    """Verify that jobs from starving departments have higher deferral penalties."""
    builder = ObjectiveBuilder()

    fairness_data = {
        "Engineering": {"overdue_jobs": 12, "pressure": "HIGH", "penalty": 18.0},
        "S&T": {"overdue_jobs": 7, "pressure": "MEDIUM", "penalty": 9.0},
        "TRD": {"overdue_jobs": 1, "pressure": "LOW", "penalty": 1.0},
    }

    job_eng = MaintenanceJob(id="J-ENG", department="Engineering")
    job_trd = MaintenanceJob(id="J-TRD", department="TRD")

    pen_eng = builder.backlog_penalty(job_eng, fairness_data)
    pen_trd = builder.backlog_penalty(job_trd, fairness_data)

    assert pen_eng > pen_trd
    assert pen_eng >= 18 * builder.backlog_multiplier


def test_utilization_bonus():
    """Verify that longer duration jobs provide higher utilization reward."""
    builder = ObjectiveBuilder()
    window = {"id": "W1", "minutes": 180}

    job_long = MaintenanceJob(id="J-LONG", duration_minutes=120)
    job_short = MaintenanceJob(id="J-SHORT", duration_minutes=30)

    bonus_long = builder.utilization_bonus(job_long, window)
    bonus_short = builder.utilization_bonus(job_short, window)

    assert bonus_long > bonus_short


def test_build_matrix():
    """Verify matrix calculation across multiple jobs and windows."""
    builder = ObjectiveBuilder()
    jobs = [
        MaintenanceJob(id="J-01", department="Engineering", duration_minutes=60, tier=Tier.TIER_1),
        MaintenanceJob(id="J-02", department="TRD", duration_minutes=90, tier=Tier.TIER_3),
    ]
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180},
        {"id": "W2", "corridorId": "C2", "minutes": 240},
    ]

    matrix = builder.build_matrix(jobs, windows)

    assert "job_coefficients" in matrix
    assert "window_rewards" in matrix
    assert "J-01" in matrix["window_rewards"]
    assert "W1" in matrix["window_rewards"]["J-01"]
    assert matrix["window_rewards"]["J-01"]["W1"] > 0
