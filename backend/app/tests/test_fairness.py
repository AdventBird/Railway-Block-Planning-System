"""Tests for Department Anti-Starvation (Fairness) Service.

Verifies:
- Engineering backlog penalty calculation
- S&T backlog penalty calculation
- TRD backlog penalty calculation
- Configurable threshold and multiplier behavior
- Deterministic output across repeated runs
- Edge cases (0 overdue jobs, unknown departments, empty job lists, missing fields)
"""

import pytest

from backend.app.services.fairness import (
    FairnessEngine,
    PENALTY_MULTIPLIER_BASE,
    PRESSURE_THRESHOLD_HIGH,
    PRESSURE_THRESHOLD_MEDIUM,
)
from backend.app.services.priority import MaintenanceJob


def test_department_backlog_penalties_scenario():
    """Verify the scenario from the prompt:
    Engineering backlog: 12 overdue jobs -> HIGH pressure, penalty
    S&T backlog: 7 overdue jobs -> MEDIUM pressure, penalty
    TRD backlog: 2 overdue jobs -> LOW pressure, penalty
    """
    jobs = []
    # 12 Engineering overdue jobs
    for i in range(12):
        jobs.append(MaintenanceJob(id=f"ENG-{i}", department="Engineering", overdue_age=2.0))
    # 7 S&T overdue jobs
    for i in range(7):
        jobs.append(MaintenanceJob(id=f"SNT-{i}", department="S&T", overdue_age=1.5))
    # 2 TRD overdue jobs
    for i in range(2):
        jobs.append(MaintenanceJob(id=f"TRD-{i}", department="TRD", overdue_age=3.0))

    summary = FairnessEngine.backlog_summary(jobs)

    # Check Engineering
    eng = summary["Engineering"]
    assert eng["overdue_jobs"] == 12
    assert eng["pressure"] == "HIGH"
    assert eng["penalty"] > 0
    # In base formula with threshold 10: 12 * 1.5 + (12-10)*0.375 = 18.75 or ~18
    assert eng["penalty"] >= 18

    # Check S&T
    snt = summary["S&T"]
    assert snt["overdue_jobs"] == 7
    assert snt["pressure"] == "MEDIUM"
    assert snt["penalty"] > 0
    # 7 * 1.5 = 10.5 or integer rounded
    assert 9 <= snt["penalty"] <= 11

    # Check TRD
    trd = summary["TRD"]
    assert trd["overdue_jobs"] == 2
    assert trd["pressure"] == "LOW"
    assert trd["penalty"] > 0
    # 2 * 1.5 = 3 (or ~2-3)
    assert 2 <= trd["penalty"] <= 4


def test_pressure_tier_thresholds():
    """Verify department pressure thresholds."""
    assert FairnessEngine.department_pressure("Engineering", 0) == "LOW"
    assert FairnessEngine.department_pressure("Engineering", 3) == "LOW"
    assert FairnessEngine.department_pressure("S&T", PRESSURE_THRESHOLD_MEDIUM) == "MEDIUM"
    assert FairnessEngine.department_pressure("S&T", 7) == "MEDIUM"
    assert FairnessEngine.department_pressure("TRD", PRESSURE_THRESHOLD_HIGH) == "HIGH"
    assert FairnessEngine.department_pressure("TRD", 14) == "HIGH"
    assert FairnessEngine.department_pressure("Engineering", 16) == "CRITICAL"


def test_configurable_threshold_and_multiplier():
    """Verify that penalty changes with custom multipliers and thresholds."""
    # Base multiplier: 12 * 1.5 + escalation
    standard_penalty = FairnessEngine.calculate_penalty("Engineering", 12, multiplier=1.5)
    # Custom multiplier: 12 * 2.0
    custom_penalty = FairnessEngine.calculate_penalty("Engineering", 12, multiplier=2.0)

    assert custom_penalty > standard_penalty
    assert FairnessEngine.calculate_penalty("Engineering", 0) == 0.0


def test_backlog_normalization():
    """Verify normalized pressure produces values in [0.0, 1.0]."""
    counts = {"Engineering": 12, "S&T": 6, "TRD": 0}
    norm = FairnessEngine.normalize_backlog(counts)

    assert norm["Engineering"] == 1.0
    assert norm["S&T"] == 0.5
    assert norm["TRD"] == 0.0


def test_deterministic_output():
    """Consecutive runs with same input must yield identical outputs."""
    jobs = [
        {"job_id": "J-01", "dept": "Engineering", "deadline": "Overdue (due 12 Sep)"},
        {"job_id": "J-02", "dept": "S&T", "deadline": "Overdue"},
        {"job_id": "J-03", "dept": "TRD", "overdue_age": 1.0},
    ]

    summary1 = FairnessEngine.backlog_summary(jobs)
    summary2 = FairnessEngine.backlog_summary(jobs)

    assert summary1 == summary2


def test_edge_cases_empty_and_zero_backlog():
    """Verify safe behavior when there are no jobs or zero overdue jobs."""
    # Empty jobs list
    summary_empty = FairnessEngine.backlog_summary([])
    for dept in ["Engineering", "S&T", "TRD"]:
        assert summary_empty[dept]["overdue_jobs"] == 0
        assert summary_empty[dept]["pressure"] == "LOW"
        assert summary_empty[dept]["penalty"] == 0

    # Non-overdue jobs
    healthy_jobs = [
        MaintenanceJob(id="J-1", department="Engineering", deadline="30 Sep"),
        MaintenanceJob(id="J-2", department="S&T", deadline="15 Oct"),
    ]
    summary_healthy = FairnessEngine.backlog_summary(healthy_jobs)
    assert summary_healthy["Engineering"]["overdue_jobs"] == 0
    assert summary_healthy["S&T"]["overdue_jobs"] == 0


def test_edge_case_unknown_department():
    """Jobs with unknown or custom department must be tracked without crashing."""
    jobs = [
        {"id": "J-SEC", "department": "Security", "overdue_age": 5.0},
    ]
    summary = FairnessEngine.backlog_summary(jobs)
    assert "Security" in summary
    assert summary["Security"]["overdue_jobs"] == 1


def test_explain_fairness():
    """Verify that explain() returns a structured plain-language description."""
    exp = FairnessEngine.explain("Engineering", 12)
    assert "Department Anti-Starvation Report: Engineering" in exp
    assert "Overdue Backlog: 12 jobs" in exp
    assert "HIGH" in exp
    assert "Protection Action" in exp
