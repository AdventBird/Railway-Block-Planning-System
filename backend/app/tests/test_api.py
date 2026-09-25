"""Unit tests for Railway API router and endpoints.

Verifies:
- POST /api/evaluate
- GET  /api/scenarios
- POST /api/scenarios/run
- POST /api/replan
"""

import pytest

from backend.app.api import dispatch_request


def test_api_get_scenarios():
    """Verify GET /api/scenarios returns catalog."""
    status_code, body = dispatch_request("GET", "/api/scenarios")
    assert status_code == 200
    assert "scenarios" in body
    assert len(body["scenarios"]) == 4


def test_api_post_evaluate():
    """Verify POST /api/evaluate returns multi-mode results."""
    status_code, body = dispatch_request(
        "POST",
        "/api/evaluate",
        {"scenario_id": "normal", "modes": ["EARLIEST_AVAILABLE", "GREEDY_PRIORITY", "CP_SAT"]},
    )
    assert status_code == 200
    assert body["scenario_id"] == "normal"
    assert "results" in body
    assert "CP_SAT" in body["results"]
    assert "EARLIEST_AVAILABLE" in body["results"]
    assert "GREEDY_PRIORITY" in body["results"]


def test_api_post_scenarios_run():
    """Verify POST /api/scenarios/run executes scenario."""
    status_code, body = dispatch_request("POST", "/api/scenarios/run", {"scenario_id": "bundling"})
    assert status_code == 200
    assert body["scenario_id"] == "bundling"
    assert body["status"] in ("OPTIMAL", "FEASIBLE")
    assert "result" in body


def test_api_post_replan():
    """Verify POST /api/replan executes dynamic replanning."""
    payload = {
        "current_plan": {
            "plan_version": "r1",
            "assignments": [{"jobId": "J-1", "windowId": "W1", "start": "01:00", "end": "02:00"}],
            "deferred_jobs": [],
        },
        "current_jobs": [
            {"id": "J-1", "corridorId": "C1", "duration_minutes": 60, "tier": 1},
        ],
        "windows": [
            {"id": "W1", "corridorId": "C1", "minutes": 180, "start": "01:00", "end": "04:00"},
        ],
        "event": {
            "type": "WINDOW_REDUCED",
            "payload": {"windowId": "W1", "minutes": 120},
        },
    }
    status_code, body = dispatch_request("POST", "/api/replan", payload)
    assert status_code == 200
    assert body["plan_version"] == "r2"
    assert body["trigger"] == "WINDOW_REDUCED"
    assert "metrics" in body
