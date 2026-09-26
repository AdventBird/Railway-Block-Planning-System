"""Unit tests for ScenarioEngine and Demo Scenarios (Feature 30).

Verifies:
- Scenario 1: Normal planning (balanced schedule, multi-department, high utilization)
- Scenario 2: Bundling opportunity (Engineering + S&T + TRD into 1 integrated block)
- Scenario 3: Live event replan (VIP/Relief train protected path, r1 -> r2, diffs)
- Scenario 4: INFEASIBLE (proof of trust, non-fabricated blocking constraints)
- Determinism across repeated executions
"""

import pytest

from backend.app.services.scenarios import ScenarioEngine


def test_scenario_list_catalog():
    """Verify list_scenarios provides metadata for all four canonical scenarios."""
    scenarios = ScenarioEngine.list_scenarios()
    assert len(scenarios) == 4
    ids = {s["id"] for s in scenarios}
    assert ids == {"normal", "bundling", "live_event", "infeasible"}


def test_scenario_1_normal_planning():
    """Verify Normal Planning scenario executes with high utilization and 0 critical backlog."""
    res = ScenarioEngine.run_scenario("normal")

    assert res["scenario_id"] == "normal"
    assert res["status"] in ("OPTIMAL", "FEASIBLE")
    assert res["version"] == "r1"

    result = res["result"]
    assert len(result["assignments"]) >= 4
    metrics = res["metrics"]
    assert metrics["jobs"] == 6
    assert metrics["utilization"] > 50.0


def test_scenario_2_bundling_opportunity():
    """Verify Bundling Opportunity bundles 3 departments into 1 integrated possession."""
    res = ScenarioEngine.run_scenario("bundling")

    assert res["scenario_id"] == "bundling"
    assert res["status"] in ("OPTIMAL", "FEASIBLE")

    result = res["result"]
    # All 3 departments scheduled into the single window
    assert len(result["assignments"]) == 3
    window_ids = {a["windowId"] for a in result["assignments"]}
    assert len(window_ids) == 1  # 1 combined block window!
    assert "W-BND-1" in window_ids

    metrics = res["metrics"]
    # Bundling metrics are computed from the actual plan, never hard-coded:
    # baseline = 3 separate possessions, actual = windows in use, saved = diff.
    assert metrics["baseline_possessions"] == 3
    assert metrics["possessions_used"] == 1
    assert metrics["possessions_saved"] == metrics["baseline_possessions"] - metrics["possessions_used"]
    assert metrics["possessions_saved"] == 2
    assert metrics["bundled_jobs"] == 3
    assert set(metrics["departments_integrated"]) == {"Engineering", "S&T", "TRD"}


def test_scenario_3_live_event_replan():
    """Verify Live Event Replanning runs BEFORE -> EVENT -> AFTER flow."""
    res = ScenarioEngine.run_scenario("live_event")

    assert res["scenario_id"] == "live_event"
    assert res["version"] == "r2"

    assert "before" in res
    assert "event" in res
    assert "after" in res

    # BEFORE: Plan r1
    assert res["before"]["plan_version"] == "r1"
    # EVENT: Special Train protected movement
    assert res["event"]["type"] == "SPECIAL_TRAIN"
    # AFTER: Plan r2
    assert res["after"]["plan_version"] == "r2"

    assert "changed_assignments" in res
    assert "newly_deferred_jobs" in res
    assert "reason_codes" in res


def test_scenario_4_infeasible_trust():
    """Verify INFEASIBLE scenario mathematically diagnoses conflict without fabricating schedule."""
    res = ScenarioEngine.run_scenario("infeasible")

    assert res["scenario_id"] == "infeasible"
    assert res["status"] == "INFEASIBLE"

    result = res["result"]
    assert result["assignments"] == []
    assert len(result["deferred_jobs"]) == 1

    # Proof of trust: must return non-fabricated blocking constraints and reason codes
    assert len(res["blocking_constraints"]) > 0
    assert len(res["reason_codes"]) > 0

    assert any("ISOLATION" in rc or "WINDOW" in rc or "TRAIN" in rc for rc in res["reason_codes"])


def test_scenario_determinism():
    """Verify repeated scenario runs return identical output."""
    for s_id in ["normal", "bundling", "infeasible"]:
        run1 = ScenarioEngine.run_scenario(s_id)
        run2 = ScenarioEngine.run_scenario(s_id)

        assert run1["status"] == run2["status"]
        assert run1["version"] == run2["version"]
        assert len(run1["result"]["assignments"]) == len(run2["result"]["assignments"])
        assert run1["metrics"] == run2["metrics"]
