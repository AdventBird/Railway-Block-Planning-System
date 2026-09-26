"""API tests for the planning/simulation/evaluation endpoints.

All requests go through the ONE FastAPI application
(``backend.app.api.app``); the former legacy zero-dependency dispatcher is
retired.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.api.app import create_app


@pytest.fixture(scope="module")
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


def test_api_get_scenarios(client):
    res = client.get("/api/scenarios")
    assert res.status_code == 200
    body = res.json()
    assert "scenarios" in body["payload"]
    assert len(body["payload"]["scenarios"]) == 4


def test_api_post_evaluate(client):
    res = client.post(
        "/api/evaluate",
        json={"scenario_id": "normal", "modes": ["EARLIEST_AVAILABLE", "GREEDY_PRIORITY", "CP_SAT"]},
    )
    assert res.status_code == 200
    body = res.json()
    results = body["payload"]["results"]
    assert "CP_SAT" in results
    assert "EARLIEST_AVAILABLE" in results
    assert "GREEDY_PRIORITY" in results


def test_api_post_scenarios_run(client):
    res = client.post("/api/scenarios/run", json={"scenario_id": "bundling"})
    assert res.status_code == 200
    body = res.json()
    assert body["payload"]["scenario_id"] == "bundling"
    assert body["payload"]["status"] in ("OPTIMAL", "FEASIBLE")
    assert "result" in body["payload"]


def test_api_post_replan(client):
    payload = {
        "event": {
            "type": "SPECIAL_TRAIN",
            "payload": {
                "train": {
                    "id": "T-1",
                    "corridorId": "C1",
                    "start": "02:00",
                    "end": "03:00",
                    "isProtected": True,
                }
            },
        },
        "current_plan": {
            "plan_version": "r1",
            "assignments": [{"jobId": "J-1", "windowId": "W1", "start": "01:00", "end": "02:00"}],
            "deferred_jobs": [],
        },
        "mode": "BALANCED",
    }
    res = client.post("/api/replan", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["payload"]["status"] in ("OPTIMAL", "FEASIBLE")
    assert body["payload"]["plan_version"] == "r2"


def test_api_planner_run(client):
    res = client.post("/api/planner/run", json={"mode": "BALANCED"})
    assert res.status_code == 200
    body = res.json()
    assert body["payload"]["status"] in ("OPTIMAL", "FEASIBLE")
    for assignment in body["payload"]["assignments"]:
        assert "start" in assignment and "end" in assignment
        assert "start_minutes" in assignment  # continuous-timeline output


def test_api_governance_lifecycle(client):
    res = client.post("/api/planner/run", json={"mode": "BALANCED"})
    assert res.status_code == 200
    store = res.json()["payload"]
    plan_id = None
    # the planner stores PLAN-r1 by default
    got = client.get("/api/plans/PLAN-r1")
    assert got.status_code == 200
    plan_id = got.json()["payload"]["plan_id"]

    approve = client.post(
        f"/api/plans/{plan_id}/approve",
        json={"action": "APPROVE", "officer": "OPS-TEST", "reason": "integration test"},
    )
    assert approve.status_code == 200
    assert approve.json()["payload"]["status"] == "APPROVED"

    lock = client.post(
        f"/api/plans/{plan_id}/lock",
        json={"action": "LOCK", "officer": "OPS-TEST", "reason": "freeze"},
    )
    assert lock.status_code == 200
    assert lock.json()["payload"]["status"] == "LOCKED"

    audit = client.get(f"/api/plans/{plan_id}/audit")
    assert audit.status_code == 200
    actions = [e["action"] for e in audit.json()["payload"]["audit"]]
    assert "APPROVE" in actions and "LOCK" in actions
    for entry in audit.json()["payload"]["audit"]:
        assert entry["officer"]
        assert entry["timestamp"]
        assert entry["plan_version"]
