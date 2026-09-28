"""Comprehensive Architectural and Governance Tests for Railway Block Planning System.

Tests:
1. Model hierarchy: Station -> Section -> Track -> Block -> Jobs
2. Single Authoritative Deadline consistency
3. Setup / Work / Restore possession calculation
4. Endpoints: GET /api/plans, POST /api/plans/generate, POST /api/plans/{plan_id}/simulate
5. Variable Block Simulation (W1, W2, W3, W4) without mutating baseline
6. Approval Lifecycle: PENDING -> APPROVE -> LOCK
7. Lock enforcement: cannot lock unapproved, cannot edit locked
8. Rejection validation: requires specific non-empty reason
9. Revision Immutability: modifying creates new revision without mutating past revisions
"""

from __future__ import annotations

import copy
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from backend.app.api.app import create_app
from backend.app.schemas import (
    BlockAssignment,
    BlockType,
    LineConfiguration,
    LineDirection,
    MaintenanceJob,
    Plan,
    PlanDecision,
    PlanRevision,
    Section,
    Station,
    Track,
)
from backend.app.services.governance import PlanStore, get_plan_store
from backend.app.services.planning import run_plan


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


class TestDomainModelHierarchy:
    """Verify Station -> Section -> Track -> Block -> Jobs hierarchy."""

    def test_station_and_track_models(self):
        stn = Station(id="NDLS", name="New Delhi", code="NDLS", junction=True)
        assert stn.id == "NDLS"
        assert stn.junction is True

        track_up = Track(
            id="TRK-NDLS-GZB-UP",
            section_id="SEC-NDLS-GZB",
            direction=LineDirection.UP,
            line_type=LineConfiguration.DOUBLE,
            status="clear",
        )
        track_dn = Track(
            id="TRK-NDLS-GZB-DN",
            section_id="SEC-NDLS-GZB",
            direction=LineDirection.DOWN,
            line_type=LineConfiguration.DOUBLE,
            status="clear",
        )

        sec = Section(
            section_id="SEC-NDLS-GZB",
            name="New Delhi - Ghaziabad",
            corridor_id="C1",
            from_station_id="NDLS",
            to_station_id="GZB",
            line_configuration=LineConfiguration.DOUBLE,
            lines=[LineDirection.UP, LineDirection.DOWN],
            tracks=[track_up, track_dn],
            operational_status="clear",
        )
        assert len(sec.tracks) == 2
        assert sec.tracks[0].direction == LineDirection.UP
        assert sec.tracks[1].direction == LineDirection.DOWN

    def test_job_possession_breakdown(self):
        """Test setup, work, restore durations and total possession minutes."""
        job = MaintenanceJob(
            job_id="J-TEST",
            source_record_id="REC-1",
            department="Engineering",
            source_system="TMS",
            title="Rail weld test",
            asset="KM 18/4 UP",
            location="KM 18/4",
            corridor_id="C1",
            section_id="SEC-NDLS-GZB",
            track_id="TRK-NDLS-GZB-UP",
            direction="UP",
            safety_consequence="SPEED_RESTRICTION",
            asset_criticality="SAFETY_CRITICAL",
            urgency="IMMEDIATE",
            deadline_pressure="SHORT",
            operational_impact="CORRIDOR",
            overdue=False,
            overdue_days=0,
            deadline=datetime.fromisoformat("2026-09-16T04:00:00+05:30"),
            duration_minutes=90,
            setup_duration_minutes=15,
            restore_duration_minutes=10,
            line_configuration=LineConfiguration.DOUBLE,
        )
        assert job.duration_minutes == 90
        assert job.setup_duration_minutes == 15
        assert job.restore_duration_minutes == 10
        assert job.total_possession_minutes == 115
        assert job.section_id == "SEC-NDLS-GZB"
        assert job.track_id == "TRK-NDLS-GZB-UP"
        assert job.direction == "UP"

    def test_block_assignment_structure(self):
        assignment = BlockAssignment(
            id="ASG-01",
            plan_revision_id="PLAN-rev-1",
            block_id="W1",
            section_id="SEC-NDLS-GZB",
            track_id="TRK-NDLS-GZB-UP",
            direction=LineDirection.UP,
            block_type=BlockType.TRAFFIC,
            job_ids=["J-02", "J-09"],
            execution_mode="PARALLEL",
            status="PLANNED",
        )
        assert assignment.section_id == "SEC-NDLS-GZB"
        assert assignment.direction == LineDirection.UP
        assert len(assignment.job_ids) == 2


class TestAuthoritativeDeadlines:
    """Verify single authoritative deadline behavior and consistency."""

    def test_jobs_endpoint_deadlines(self, client):
        res = client.get("/api/jobs")
        assert res.status_code == 200
        jobs = res.json()["payload"]["jobs"]
        assert len(jobs) > 0

        # Each job must have one valid deadline
        for j in jobs:
            assert "deadline" in j
            if j["deadline"] is not None:
                # Must be valid ISO format
                parsed = datetime.fromisoformat(j["deadline"])
                assert parsed.year >= 2026


class TestPlanRevisionAndLockingLifecycle:
    """Test full governance lifecycle: DRAFT -> PENDING -> APPROVE -> LOCK and revision immutability."""

    def test_governance_lifecycle(self):
        store = PlanStore()
        base_plan = {"assignments": [{"job_id": "J-02", "window": "W1"}], "metrics": {"scheduled": 1}}
        saved = store.save_plan(base_plan, plan_id="PLAN-TEST-1", officer="planner")
        assert saved["status"] == "PENDING_APPROVAL"
        assert len(saved["revisions"]) == 1
        assert saved["revisions"][0]["revision_number"] == 1
        assert saved["revisions"][0]["status"] == "PENDING_APPROVAL"

        # 1. Cannot lock unapproved plan
        with pytest.raises(ValueError, match="Only an approved plan can be locked"):
            store.lock_plan("PLAN-TEST-1", officer="Chief Controller")

        # 2. Cannot reject without reason
        with pytest.raises(ValueError, match="A specific reason is required to reject"):
            store.reject_plan("PLAN-TEST-1", officer="Chief Controller", reason="")

        # 3. Approve plan
        approved = store.approve_plan("PLAN-TEST-1", officer="Chief Controller", reason="Approved for execution")
        assert approved["status"] == "APPROVED"
        assert approved["revisions"][0]["status"] == "APPROVED"

        # 4. Lock approved plan
        locked = store.lock_plan("PLAN-TEST-1", officer="Chief Controller", reason="Locked for night ops")
        assert locked["status"] == "LOCKED"
        assert locked["revisions"][0]["status"] == "LOCKED"

        # 5. Cannot modify locked plan directly
        modified_payload = {"assignments": [{"job_id": "J-02", "window": "W2"}], "metrics": {"scheduled": 1}}
        with pytest.raises(ValueError, match="LOCKED_ASSIGNMENT_CONFLICT"):
            store.modify_plan(
                "PLAN-TEST-1",
                officer="Duty Officer",
                reason="Attempted emergency change",
                modified_plan=modified_payload,
            )

    def test_revision_immutability_on_modification(self):
        """Modifying a plan creates a new draft revision without mutating past revisions."""
        store = PlanStore()
        rev1_plan = {"assignments": [{"job_id": "J-02", "window": "W1", "start": "01:00"}], "metrics": {"scheduled": 1}}
        saved = store.save_plan(rev1_plan, plan_id="PLAN-REV-TEST", officer="planner")
        assert len(saved["revisions"]) == 1

        # Modify: create revision 2
        rev2_plan = {"assignments": [{"job_id": "J-02", "window": "W1", "start": "02:00"}], "metrics": {"scheduled": 1}}
        modified = store.modify_plan(
            "PLAN-REV-TEST",
            officer="Controller Sharma",
            reason="Retimed due to freight",
            modified_plan=rev2_plan,
        )

        assert modified["status"] == "MODIFIED"
        assert len(modified["revisions"]) == 2

        # Verify revision 1 is UNTOUCHED
        rev1 = modified["revisions"][0]
        assert rev1["revision_number"] == 1
        assert rev1["plan"]["assignments"][0]["start"] == "01:00"

        # Verify revision 2 is created as draft
        rev2 = modified["revisions"][1]
        assert rev2["revision_number"] == 2
        assert rev2["plan"]["assignments"][0]["start"] == "02:00"
        assert rev2["based_on_revision_id"] == rev1["id"]
        assert rev2["status"] == "DRAFT"


class TestSimulationApiEndpoints:
    """Test API simulation endpoint and variable block support."""

    def test_list_plans_endpoint(self, client):
        res = client.get("/api/plans")
        assert res.status_code == 200
        body = res.json()
        assert "plans" in body["payload"]
        assert body["payload"]["count"] >= 1

    def test_plans_generate_endpoint(self, client):
        res = client.post("/api/plans/generate", json={"mode": "BALANCED"})
        assert res.status_code == 200
        body = res.json()
        assert body["status"] in ("READY", "REVIEW_REQUIRED")
        assert "assignments" in body["payload"]

    def test_simulate_variable_blocks_without_mutating_plan(self, client):
        # 1. Fetch current plan baseline
        plan_res = client.get("/api/plans")
        initial_plans = plan_res.json()["payload"]["plans"]
        plan_id = initial_plans[0]["plan_id"]
        initial_rev_count = len(initial_plans[0].get("revisions", []))

        # 2. Simulate on W1 (NDLS-GZB UP)
        w1_sim = client.post(
            f"/api/plans/{plan_id}/simulate",
            json={
                "block_id": "W1",
                "event": {
                    "type": "SPECIAL_TRAIN",
                    "parameters": {
                        "trainNumber": "00214",
                        "timeStart": "02:30",
                        "timeEnd": "03:30",
                        "direction": "UP",
                    },
                },
            },
        )
        assert w1_sim.status_code == 200
        w1_body = w1_sim.json()["payload"]
        assert w1_body["block_id"] == "W1"
        assert w1_body["status"] in ("FEASIBLE", "INFEASIBLE")
        assert "baseline" in w1_body
        assert "simulated" in w1_body
        assert "changes" in w1_body

        # 3. Simulate on W2 (TDL-CNB DOWN)
        w2_sim = client.post(
            f"/api/plans/{plan_id}/simulate",
            json={
                "block_id": "W2",
                "event": {
                    "type": "WINDOW_REDUCED",
                    "parameters": {
                        "minutes": 60,
                    },
                },
            },
        )
        assert w2_sim.status_code == 200
        w2_body = w2_sim.json()["payload"]
        assert w2_body["block_id"] == "W2"
        assert w2_body["status"] in ("FEASIBLE", "INFEASIBLE")

        # 4. Verify baseline plan was NOT mutated
        after_plan_res = client.get(f"/api/plans/{plan_id}")
        after_plan = after_plan_res.json()["payload"]
        assert len(after_plan.get("revisions", [])) == initial_rev_count

    def test_plan_store_disk_persistence(self, tmp_path):
        """Verify PlanStore saves and reloads plans and revisions across process restarts."""
        storage_file = tmp_path / "test_plans.json"
        store1 = PlanStore(persistence_file=storage_file)

        mock_plan = {
            "status": "OPTIMAL",
            "plan_version": "r1",
            "assignments": [{"jobId": "J-01", "windowId": "W1"}],
            "deferred_jobs": [],
            "metrics": {"utilization": 90.0},
        }

        # Save and approve in store1
        store1.save_plan(mock_plan, plan_id="PLAN-PERSIST-1", officer="Controller A")
        store1.act("PLAN-PERSIST-1", "APPROVE", officer="Dy. COM", reason="Night clearance")

        # Simulate process restart by creating a new store reading the same file
        store2 = PlanStore(persistence_file=storage_file)
        loaded = store2.get_plan("PLAN-PERSIST-1")

        assert loaded is not None
        assert loaded["plan_id"] == "PLAN-PERSIST-1"
        assert loaded["status"] == "APPROVED"
        assert len(loaded["revisions"]) == 1
        assert len(store2.audit_history("PLAN-PERSIST-1")) == 2
