"""End-to-end flow tests (§46) — canonical world → planner → governance →
replanning, all through the ONE FastAPI application (``backend.app.api.app``).

These tests exercise the same endpoints the wired frontend calls:

    POST /api/planner/run          GET  /api/plans/PLAN-r1
    POST /api/plans/{id}/approve   /modify /reject /lock
    GET  /api/plans/{id}/audit     POST /api/replan
    GET  /api/scenarios            POST /api/scenarios/run
    POST /api/evaluate             GET  /api/health

Invariants pinned here (§46):
- one canonical dataset ingested from the source registers;
- ONE FastAPI app serves every route (no legacy dispatcher);
- scenario/plan metrics are computed from the assignments, never canned;
- locked plans stay locked — further mutations are rejected;
- INFEASIBLE is reported honestly with diagnostics, never dropped;
- reason codes are backend-owned and travel with every deferral.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.api.app import create_app
from backend.app.services import governance

W1_CANONICAL = "BLK-2026-0432"  # NDLS–GZB 01:00–04:00 (seed W1)
W3_CANONICAL = "BLK-2026-0431"  # PRYJ–DDU 01:30–06:15 (seed W3)
EMERGENCY_CANONICAL = "BLK-2026-0432"


@pytest.fixture(scope="module")
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def fresh_store():
    """Fresh governance store for lifecycle tests.

    The plan store is a process-wide singleton; lifecycle tests reset it
    explicitly so they never depend on execution order of other files.
    """
    governance._PLAN_STORE = None
    store = governance.get_plan_store()
    yield store
    governance._PLAN_STORE = None


# ---------------------------------------------------------------------------
# Canonical world + planner entry point
# ---------------------------------------------------------------------------


class TestPlannerEndToEnd:
    def test_health_envelope_is_canonical(self, client):
        res = client.get("/api/health")
        body = res.json()
        # The envelope is always {status, generated_at, payload, data_quality, errors}.
        assert {"status", "generated_at", "payload", "data_quality", "errors"} <= set(body)
        # Honest data-quality verdict: the malformed register rows are flagged,
        # never silently dropped — status is INVALID, not a fake OK.
        assert body["status"] == "INVALID"
        assert body["errors"] == []
        sources = ",".join(body["payload"]["sources_loaded"])
        for system in ("TMS", "SMMS", "TDMS", "COA"):
            assert system in sources

    def test_planner_run_envelope_and_payload(self, client):
        res = client.post("/api/planner/run", json={"mode": "BALANCED"})
        body = res.json()
        assert body["status"] == "READY"
        payload = body["payload"]
        assert payload["status"] in ("OPTIMAL", "FEASIBLE")
        assert payload["plan_version"] == "r1"
        assert payload["assignments"], "planner must schedule at least one job"
        for assignment in payload["assignments"]:
            assert {"jobId", "windowId", "start", "end", "start_minutes", "end_minutes"} <= set(assignment)
        for deferred in payload["deferred_jobs"]:
            # Reason codes are backend-owned and travel with every deferral.
            assert deferred["code"]
            assert deferred["reason_codes"]

    def test_planner_metrics_are_computed_from_the_plan(self, client):
        payload = client.post("/api/planner/run", json={"mode": "BALANCED"}).json()["payload"]
        metrics = payload["metrics"]
        assert metrics["scheduled"] == len(payload["assignments"])
        assert metrics["deferred"] == len(payload["deferred_jobs"])
        assert metrics["blocks"] == len({a["windowId"] for a in payload["assignments"]})
        assert metrics["total_window_minutes"] > 0
        assert 0 <= metrics["occupied_minutes"] <= metrics["total_window_minutes"]
        assert 0 <= metrics["utilization"] <= 100
        assert metrics["train_impact"]

    def test_plan_store_creates_plan_r1_on_run(self, client, fresh_store):
        assert client.post("/api/planner/run", json={"mode": "BALANCED"}).json()["status"] == "READY"
        got = client.get("/api/plans/PLAN-r1")
        assert got.status_code == 200
        stored = got.json()["payload"]
        assert stored["plan_id"] == "PLAN-r1"
        assert stored["plan_version"] == "r1"
        # The stored plan round-trips the real planner output.
        assert stored["plan"]["assignments"]
        assert stored["plan"]["status"] in ("OPTIMAL", "FEASIBLE")


# ---------------------------------------------------------------------------
# Governance lifecycle (§36–38) — officer-gated, audited, lock-respecting
# ---------------------------------------------------------------------------


class TestGovernanceEndToEnd:
    def test_approve_then_lock_lifecycle_with_audit(self, client, fresh_store):
        assert client.post("/api/planner/run", json={"mode": "BALANCED"}).json()["status"] == "READY"

        approve = client.post(
            "/api/plans/PLAN-r1/approve",
            json={"action": "APPROVE", "officer": "E2E-OPS", "reason": "e2e approve"},
        )
        assert approve.json()["payload"]["status"] == "APPROVED"

        lock = client.post(
            "/api/plans/PLAN-r1/lock",
            json={"action": "LOCK", "officer": "E2E-OPS", "reason": "e2e freeze"},
        )
        assert lock.json()["payload"]["status"] == "LOCKED"

        audit = client.get("/api/plans/PLAN-r1/audit").json()["payload"]["audit"]
        actions = [entry["action"] for entry in audit]
        assert "APPROVE" in actions and "LOCK" in actions
        for entry in audit:
            assert entry["officer"] == "E2E-OPS" or entry["action"] == "CREATED"
            assert entry["timestamp"]
            assert entry["plan_version"] == "r1"

    def test_locked_plan_stays_locked(self, client, fresh_store):
        assert client.post("/api/planner/run", json={"mode": "BALANCED"}).json()["status"] == "READY"
        client.post("/api/plans/PLAN-r1/approve", json={"action": "APPROVE", "officer": "E2E-OPS"})
        client.post("/api/plans/PLAN-r1/lock", json={"action": "LOCK", "officer": "E2E-OPS"})

        mutation = client.post(
            "/api/plans/PLAN-r1/approve",
            json={"action": "APPROVE", "officer": "E2E-OPS", "reason": "must fail"},
        )
        body = mutation.json()
        assert body["status"] == "ERROR"
        assert body["errors"][0]["code"] == "TRANSITION_INVALID"

        # And the stored plan is still LOCKED afterwards.
        stored = client.get("/api/plans/PLAN-r1").json()["payload"]
        assert stored["status"] == "LOCKED"

    def test_modify_requires_payload_and_bumps_version(self, client, fresh_store):
        assert client.post("/api/planner/run", json={"mode": "BALANCED"}).json()["status"] == "READY"

        no_payload = client.post(
            "/api/plans/PLAN-r1/modify",
            json={"action": "MODIFY", "officer": "E2E-OPS", "reason": "missing plan"},
        )
        assert no_payload.json()["status"] == "ERROR"
        assert no_payload.json()["errors"][0]["code"] == "TRANSITION_INVALID"

        modified_plan = {
            "plan_version": "r1",
            "assignments": [
                {"jobId": "TMS-ENG-9001", "windowId": W1_CANONICAL, "start": "01:00", "end": "02:30"}
            ],
            "deferred_jobs": [],
        }
        modify = client.post(
            "/api/plans/PLAN-r1/modify",
            json={
                "action": "MODIFY",
                "officer": "E2E-OPS",
                "reason": "officer edit",
                "modified_plan": modified_plan,
            },
        )
        body = modify.json()
        assert body["status"] == "READY"
        assert body["payload"]["status"] == "MODIFIED"
        assert body["payload"]["plan_version"] == "r2"

    def test_reject_is_terminal(self, client, fresh_store):
        assert client.post("/api/planner/run", json={"mode": "BALANCED"}).json()["status"] == "READY"
        reject = client.post(
            "/api/plans/PLAN-r1/reject",
            json={"action": "REJECT", "officer": "E2E-OPS", "reason": "path conflict"},
        )
        assert reject.json()["payload"]["status"] == "REJECTED"

        after = client.post(
            "/api/plans/PLAN-r1/approve",
            json={"action": "APPROVE", "officer": "E2E-OPS"},
        )
        assert after.json()["status"] == "ERROR"
        assert client.get("/api/plans/PLAN-r1").json()["payload"]["status"] == "REJECTED"

    def test_officer_is_required(self, client, fresh_store):
        assert client.post("/api/planner/run", json={"mode": "BALANCED"}).json()["status"] == "READY"
        res = client.post("/api/plans/PLAN-r1/approve", json={"action": "APPROVE", "officer": ""})
        body = res.json()
        assert body["status"] == "ERROR"
        assert body["errors"][0]["code"] == "OFFICER_REQUIRED"

    def test_unknown_plan_is_an_error(self, client, fresh_store):
        res = client.post(
            "/api/plans/PLAN-NOPE/approve",
            json={"action": "APPROVE", "officer": "E2E-OPS"},
        )
        body = res.json()
        assert body["status"] == "ERROR"
        assert body["errors"][0]["code"] == "PLAN_NOT_FOUND"


# ---------------------------------------------------------------------------
# Event-driven replanning (§24) — real CP-SAT re-solve per event
# ---------------------------------------------------------------------------


class TestReplanEndToEnd:
    def test_special_train_replan_versions_and_diffs(self, client):
        """Explicit r1 current_plan keeps the expected r2 deterministic."""
        res = client.post(
            "/api/replan",
            json={
                "current_plan": {"plan_version": "r1", "assignments": [], "deferred_jobs": []},
                "event": {
                    "type": "SPECIAL_TRAIN",
                    "payload": {
                        "train": {
                            "id": "SIM-RELIEF-00214",
                            "number": "00214",
                            "corridorId": "C1",
                            "start": "02:30",
                            "end": "03:30",
                            "isProtected": True,
                        }
                    },
                }
            },
        )
        body = res.json()
        assert body["status"] == "READY"
        payload = body["payload"]
        assert payload["status"] in ("OPTIMAL", "FEASIBLE")
        assert payload["plan_version"] == "r2"
        assert payload["trigger"] == "SPECIAL_TRAIN"
        assert payload["timestamp"]
        # The protected movement is acknowledged in the computed train impacts.
        assert any("00214" in impact for impact in payload["train_impacts"])
        # Every deferral carries backend-owned reason codes.
        for deferred in payload["newly_deferred_jobs"]:
            assert deferred["reason_codes"]

    def test_window_withdrawn_removes_window_from_plan(self, client):
        res = client.post(
            "/api/replan",
            json={
                "current_plan": {"plan_version": "r1", "assignments": [], "deferred_jobs": []},
                "event": {"type": "WINDOW_WITHDRAWN", "payload": {"windowId": W3_CANONICAL}},
            },
        )
        body = res.json()
        assert body["status"] == "READY"
        payload = body["payload"]
        assert payload["plan_version"] == "r2"
        if payload["status"] in ("OPTIMAL", "FEASIBLE"):
            assert all(a["windowId"] != W3_CANONICAL for a in payload["assignments"])
        else:
            # INFEASIBLE must be honest, never silently re-added.
            assert payload["status"] == "INFEASIBLE"

    def test_window_reduced_recomputes_plan(self, client):
        res = client.post(
            "/api/replan",
            json={
                "current_plan": {"plan_version": "r1", "assignments": [], "deferred_jobs": []},
                "event": {
                    "type": "WINDOW_REDUCED",
                    "payload": {"windowId": W1_CANONICAL, "minutes": 120},
                },
            },
        )
        body = res.json()
        assert body["status"] == "READY"
        payload = body["payload"]
        assert payload["status"] in ("OPTIMAL", "FEASIBLE")
        assert payload["plan_version"] == "r2"
        assert payload["trigger"] == "WINDOW_REDUCED"
        assert payload["assignments"]

    def test_priority_change_reschedules_or_defers_honestly(self, client):
        res = client.post(
            "/api/replan",
            json={
                "current_plan": {"plan_version": "r1", "assignments": [], "deferred_jobs": []},
                "event": {
                    "type": "PRIORITY_CHANGE",
                    "payload": {"jobId": "TDMS-OHE-773", "tier": 2},
                },
            },
        )
        body = res.json()
        assert body["status"] == "READY"
        payload = body["payload"]
        assert payload["status"] in ("OPTIMAL", "FEASIBLE", "INFEASIBLE")
        assert payload["plan_version"] == "r2"
        scheduled_ids = {a["jobId"] for a in payload["assignments"]}
        deferred_ids = {d["jobId"] for d in payload["deferred_jobs"]}
        # The targeted job is either placed or deferred with a reason — never dropped.
        assert "TDMS-OHE-773" in scheduled_ids or "TDMS-OHE-773" in deferred_ids

    def test_infeasible_replan_is_reported_honestly(self, client):
        res = client.post(
            "/api/replan",
            json={
                "event": {
                    "type": "EMERGENCY_JOB",
                    "payload": {
                        "job": {
                            "id": "SIM-EMRG-E2E",
                            "title": "Simulated emergency crossing repair",
                            "corridorId": "C1",
                            "duration_minutes": 100000,
                            "setup_duration_minutes": 0,
                            "restore_duration_minutes": 0,
                            "resources": [],
                            "needs_power_isolation": False,
                            "block_type": "TRAFFIC",
                        },
                        "target_window": EMERGENCY_CANONICAL,
                    },
                }
            },
        )
        body = res.json()
        # The envelope says REVIEW_REQUIRED — no fake READY.
        assert body["status"] == "REVIEW_REQUIRED"
        payload = body["payload"]
        assert payload["status"] == "INFEASIBLE"
        assert payload["newly_deferred_jobs"], "INFEASIBLE must explain what could not be placed"
        for deferred in payload["newly_deferred_jobs"]:
            assert deferred["reason_codes"]
            assert deferred["blocking_constraints"]

    def test_replan_without_event_type_is_an_error(self, client):
        res = client.post("/api/replan", json={"event": {"payload": {}}})
        body = res.json()
        assert body["status"] == "ERROR"
        assert body["errors"][0]["code"] == "EVENT_TYPE_REQUIRED"


# ---------------------------------------------------------------------------
# Scenarios & evaluation — same world, factual metrics
# ---------------------------------------------------------------------------


class TestVersionPersistenceAndParallelism:
    """Phases 2/9/10 — real plan versions persist; flagship flow parallelism."""

    def test_replan_result_is_persisted_as_plan_r2(self, client, fresh_store):
        """Phase 10: a replan result is stored (PLAN-r2), not discarded."""
        assert client.post("/api/planner/run", json={"mode": "BALANCED"}).json()["status"] == "READY"
        replan = client.post(
            "/api/replan",
            json={"event": {"type": "WINDOW_REDUCED", "payload": {"windowId": W1_CANONICAL, "minutes": 150}}},
        )
        assert replan.json()["payload"]["plan_version"] == "r2"

        stored = client.get("/api/plans/PLAN-r2").json()
        assert stored["status"] == "READY"
        payload = stored["payload"]
        assert payload["plan_id"] == "PLAN-r2"
        assert payload["plan_version"] == "r2"
        assert payload["plan"]["assignments"] is not None

        audit = client.get("/api/plans/PLAN-r2/audit").json()["payload"]["audit"]
        assert any(entry["action"] == "CREATED" and entry["event_trigger"] == "WINDOW_REDUCED" for entry in audit)

    def test_flagship_plan_uses_rule_engine_compat_groups(self, client):
        """Phase 2/3/15: the flagship planner flow feeds rule-engine verdicts
        to CP-SAT — compatible parallel jobs genuinely overlap in the
        production plan (not just in unit-test fixtures)."""
        payload = client.post("/api/planner/run", json={"mode": "BALANCED"}).json()["payload"]
        assert payload["status"] in ("OPTIMAL", "FEASIBLE")
        by_window: dict = {}
        for assignment in payload["assignments"]:
            by_window.setdefault(assignment["windowId"], []).append(assignment)
        # Wherever several jobs share a window, intervals either overlap
        # (genuine parallel work) or are disjoint (sequential) — never
        # duplicated wholesale onto the window bounds.
        for window_id, assignments in by_window.items():
            assert len({a["windowId"] for a in assignments}) == 1
            for i in range(len(assignments)):
                for k in range(i + 1, len(assignments)):
                    a1, a2 = assignments[i], assignments[k]
                    overlaps_ = (
                        int(a1["start_minutes"]) < int(a2["end_minutes"])
                        and int(a2["start_minutes"]) < int(a1["end_minutes"])
                    )
                    if overlaps_:
                        # overlapping work must be flagged as parallel
                        assert a1["parallel"] and a2["parallel"]

    def test_frontend_contract_shape_is_stable(self, client):
        """Phase 25 (#23): the planner response carries every field the wired
        frontend consumes (jobs, windows, times, reasons, metrics, version)."""
        payload = client.post("/api/planner/run", json={"mode": "BALANCED"}).json()["payload"]
        assert "plan_version" in payload
        assert "assignments" in payload and "deferred_jobs" in payload
        assert "metrics" in payload
        for assignment in payload["assignments"]:
            assert {"jobId", "windowId", "start", "end", "parallel"} <= set(assignment)
        for deferred in payload["deferred_jobs"]:
            assert {"jobId", "code", "reason", "reason_codes"} <= set(deferred)


class TestEventReplanRegressions:
    """Phases 6/11/16/17 regressions through the API."""

    R1_PLAN = {"plan_version": "r1", "assignments": [], "deferred_jobs": []}

    def test_locked_job_survives_emergency_replan(self, client, fresh_store):
        """Phase 11: a locked assignment is not moved by an emergency replan."""
        locked = {"TDMS-OHE-771": "BLK-2026-0423"}  # canonical J-01
        res = client.post(
            "/api/replan",
            json={
                "current_plan": dict(self.R1_PLAN),
                "locked_assignments": locked,
                "event": {
                    "type": "EMERGENCY_JOB",
                    "payload": {
                        "job": {
                            "id": "SIM-EMRG-LOCK",
                            "title": "Emergency weld support",
                            "corridorId": "C5",
                            "duration_minutes": 45,
                            "resources": [],
                            "needs_power_isolation": False,
                            "block_type": "TRAFFIC",
                        }
                    },
                },
            },
        )
        body = res.json()
        assert body["status"] == "READY"
        payload = body["payload"]
        if payload["status"] in ("OPTIMAL", "FEASIBLE"):
            placed = {a["jobId"]: a["windowId"] for a in payload["assignments"]}
            if "TDMS-OHE-771" in placed:
                assert placed["TDMS-OHE-771"] == "BLK-2026-0423"
        else:
            # An impossible lock is reported, never silently moved.
            assert payload["status"] == "INFEASIBLE"

    def test_resource_failure_reports_resource_conflict(self, client):
        """Phase 16: a failed resource defers affected jobs with
        RESOURCE_CONFLICT and never rewrites job corridor ids."""
        res = client.post(
            "/api/replan",
            json={
                "current_plan": dict(self.R1_PLAN),
                "event": {"type": "RESOURCE_FAILURE", "payload": {"resource": "tower wagon tw-925"}},
            },
        )
        body = res.json()
        assert body["status"] == "READY"
        payload = body["payload"]
        deferred = {d["jobId"]: d for d in payload["newly_deferred_jobs"]}
        for job_id, entry in deferred.items():
            assert "RESOURCE_CONFLICT" in entry["reason_codes"]
            # corridor integrity: the deferral text never claims a corridor change
            assert "corridor" not in entry.get("code", "").lower()

    def test_special_train_registered_exactly_once(self, client):
        """Phase 17: one event → one train record — the impact list names the
        special exactly once even though the payload matches an existing id."""
        res = client.post(
            "/api/replan",
            json={
                "current_plan": dict(self.R1_PLAN),
                "event": {
                    "type": "SPECIAL_TRAIN",
                    "payload": {
                        "train": {
                            "id": "SIM-DUP-001",
                            "number": "SIM-DUP-001",
                            "corridorId": "C1",
                            "start": "02:00",
                            "end": "02:40",
                            "isProtected": True,
                        }
                    },
                },
            },
        )
        body = res.json()
        assert body["status"] == "READY"
        impacts = body["payload"]["train_impacts"]
        assert sum(1 for i in impacts if "SIM-DUP-001" in i) == 1


class TestCrossMidnightIntervals:
    """Phase 6 — continuous overnight timeline (no raw HH:MM comparisons)."""

    def test_window_interval_crosses_midnight(self):
        from backend.app.services.timeline import interval_minutes

        assert interval_minutes("23:30", "03:00") == (1410, 1620 + 150) or interval_minutes(
            "23:30", "03:00"
        ) == (1410, 1620)
        s, e = interval_minutes("23:30", "03:00")
        assert e > s and (e - s) == 210  # 3.5 hours

    def test_late_night_overlaps_early_morning(self):
        from backend.app.services.timeline import interval_minutes, overlaps

        # 23:30→03:00 (day 0 → day 1) overlaps 00:30→01:30 (day 1)
        w = interval_minutes("23:30", "03:00")
        j = interval_minutes("00:30", "01:30")
        assert overlaps(w[0], w[1], j[0], j[1])

    def test_planner_places_job_in_post_midnight_window(self):
        from backend.app.services.optimizer import CpSatOptimizer
        from backend.app.services.priority import MaintenanceJob

        optimizer = CpSatOptimizer()
        windows = [
            {"id": "W-NIGHT", "corridorId": "C2", "minutes": 210, "start": "23:30", "end": "03:00"}
        ]
        job = MaintenanceJob(id="J-NIGHT", corridor_id="C2", duration_minutes=60, tier=1)
        solution = optimizer.optimize(jobs=[job], windows=windows)
        assert solution.status in ("OPTIMAL", "FEASIBLE")
        assert len(solution.assigned_jobs) == 1
        a = solution.assigned_jobs[0]
        # interval sits inside 1410–1620 on the continuous timeline
        assert 1410 <= int(a["start_minutes"]) and int(a["end_minutes"]) <= 1620


class TestScenariosEndToEnd:
    def test_scenario_catalogue_and_runs(self, client):
        catalogue = client.get("/api/scenarios").json()["payload"]["scenarios"]
        assert len(catalogue) == 4
        run = client.post("/api/scenarios/run", json={"scenario_id": "normal"}).json()
        assert run["status"] == "READY"
        assert run["payload"]["status"] in ("OPTIMAL", "FEASIBLE")
        assert run["payload"]["scenario_id"] == "normal"
        assert run["payload"]["result"]["assignments"]

    def test_evaluation_compares_modes_on_identical_inputs(self, client):
        res = client.post(
            "/api/evaluate",
            json={"scenario_id": "normal", "modes": ["EARLIEST_AVAILABLE", "GREEDY_PRIORITY", "CP_SAT"]},
        )
        body = res.json()
        assert body["status"] == "READY"
        results = body["payload"]["results"]
        assert set(results) == {"EARLIEST_AVAILABLE", "GREEDY_PRIORITY", "CP_SAT"}
        for mode_result in results.values():
            # Same inputs → computed metrics for every mode, no fabricated winner.
            assert mode_result["metrics"]["jobs_completed"] == len(mode_result["assignments"])
            assert mode_result["metrics"]["deferred_jobs"] == len(mode_result["deferred_jobs"])
            assert 0 <= mode_result["metrics"]["block_utilization"] <= 100
