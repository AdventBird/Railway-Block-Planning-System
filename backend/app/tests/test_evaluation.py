"""Unit tests for EvaluationEngine and Baseline Comparison (Feature 28).

Verifies:
- EARLIEST_AVAILABLE heuristic satisfies hard constraints
- GREEDY_PRIORITY heuristic respects tier rankings
- CP_SAT global optimization
- All three algorithms receive identical inputs
- Factual metrics generated (jobs_completed, critical_backlog, train_impact, block_utilization, possessions_used, deferred_jobs)
- Determinism across repeated runs
"""

import pytest

from backend.app.services.evaluation import EvaluationEngine, EvaluationMode
from backend.app.services.priority import MaintenanceJob, Tier
from backend.app.services.scenarios import ScenarioEngine


def test_evaluation_modes_run_on_identical_inputs():
    """Verify all 3 modes run on the exact same dataset and produce measurable differences."""
    scenario = ScenarioEngine.get_normal_scenario()

    eval_result = EvaluationEngine.evaluate(
        scenario_id="normal",
        modes=[
            EvaluationMode.EARLIEST_AVAILABLE,
            EvaluationMode.GREEDY_PRIORITY,
            EvaluationMode.CP_SAT,
        ],
        jobs=scenario.jobs,
        windows=scenario.windows,
        train_movements=scenario.train_movements,
    )

    assert eval_result["scenario_id"] == "normal"
    results = eval_result["results"]

    assert "EARLIEST_AVAILABLE" in results
    assert "GREEDY_PRIORITY" in results
    assert "CP_SAT" in results

    for mode_name, mode_res in results.items():
        assert mode_res["mode"] == mode_name
        # Heuristics report HEURISTIC honestly; only CP_SAT may be OPTIMAL/FEASIBLE.
        if mode_name == "CP_SAT":
            assert mode_res["status"] in ("OPTIMAL", "FEASIBLE", "INFEASIBLE")
        else:
            assert mode_res["status"] == "HEURISTIC"
        metrics = mode_res["metrics"]
        assert "jobs_completed" in metrics
        assert "critical_backlog" in metrics
        assert "train_impact" in metrics
        assert "block_utilization" in metrics
        assert "possessions_used" in metrics
        assert "deferred_jobs" in metrics
        assert "occupied_minutes" in metrics
        assert "unused_minutes" in metrics
        assert "combined_possessions" in metrics
        assert "critical_completed" in metrics


def test_earliest_available_respects_hard_constraints():
    """Verify EARLIEST_AVAILABLE does not violate capacity or corridor matching."""
    jobs = [
        {"id": "J1", "corridorId": "C1", "minutes": 100, "tier": 4},
        {"id": "J2", "corridorId": "C1", "minutes": 100, "tier": 1},
    ]
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"},
    ]

    res = EvaluationEngine.run_earliest_available(jobs=jobs, windows=windows)

    # W1 capacity is 180m; J1 (100m+30m=130m) fits, but J2 (130m+130m=260m) exceeds capacity
    assert len(res.assignments) == 1
    assert len(res.deferred_jobs) == 1
    # Earliest available processes J1 first (input order)
    assert res.assignments[0]["jobId"] == "J1"
    assert res.deferred_jobs[0]["jobId"] == "J2"


def test_greedy_priority_prioritizes_critical_jobs():
    """Verify GREEDY_PRIORITY schedules Tier 1 before Tier 4 into limited capacity."""
    jobs = [
        {"id": "J-LOW", "corridorId": "C1", "minutes": 100, "tier": 4, "severity": "LOW"},
        {"id": "J-CRIT", "corridorId": "C1", "minutes": 100, "tier": 1, "severity": "CRITICAL"},
    ]
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"},
    ]

    res = EvaluationEngine.run_greedy_priority(jobs=jobs, windows=windows)

    # Greedy priority must place J-CRIT first because of higher priority
    assert len(res.assignments) == 1
    assert res.assignments[0]["jobId"] == "J-CRIT"
    assert res.deferred_jobs[0]["jobId"] == "J-LOW"
    assert res.metrics["critical_backlog"] == 0
    assert res.metrics["critical_completed"] == 1


def test_cp_sat_evaluates_correctly():
    """Verify CP_SAT produces valid global solution in evaluation suite."""
    scenario = ScenarioEngine.get_bundling_scenario()

    res = EvaluationEngine.run_cp_sat(
        jobs=scenario.jobs,
        windows=scenario.windows,
        compat_groups=scenario.compat_groups,
    )

    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert len(res.assignments) == 3
    assert res.metrics["combined_possessions"] == 1
    assert res.metrics["possessions_used"] == 1


def test_evaluation_determinism():
    """Verify repeated runs of evaluate produce strictly identical output."""
    scenario = ScenarioEngine.get_normal_scenario()

    run1 = EvaluationEngine.evaluate(
        scenario_id="normal",
        jobs=scenario.jobs,
        windows=scenario.windows,
        train_movements=scenario.train_movements,
    )
    run2 = EvaluationEngine.evaluate(
        scenario_id="normal",
        jobs=scenario.jobs,
        windows=scenario.windows,
        train_movements=scenario.train_movements,
    )

    assert run1["results"]["EARLIEST_AVAILABLE"]["metrics"] == run2["results"]["EARLIEST_AVAILABLE"]["metrics"]
    assert run1["results"]["GREEDY_PRIORITY"]["metrics"] == run2["results"]["GREEDY_PRIORITY"]["metrics"]
    assert run1["results"]["CP_SAT"]["metrics"] == run2["results"]["CP_SAT"]["metrics"]
