"""Tests for the API layer, canonical envelope, and repository design."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.api.app import create_app
from backend.app.services.repository import InMemoryRepository, get_repository


@pytest.fixture(scope="module")
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


class TestCanonicalEnvelope:
    """Every endpoint must answer in the single canonical structure."""

    def test_health(self, client):
        res = client.get("/api/health")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] in ("READY", "REVIEW_REQUIRED", "STALE", "INVALID", "OK")
        assert "generated_at" in body
        assert "payload" in body
        assert body["data_quality"] is not None
        for key in ("ready", "review_required", "stale", "invalid"):
            assert key in body["data_quality"]

    def test_jobs(self, client):
        res = client.get("/api/jobs")
        assert res.status_code == 200
        body = res.json()
        assert body["payload"]["count"] > 0
        job = body["payload"]["jobs"][0]
        # Canonical job fields required by the brief.
        for field in (
            "job_id", "source_record_id", "department", "source_system", "asset",
            "location", "corridor_id", "severity", "safety_consequence",
            "asset_criticality", "overdue", "overdue_days", "deadline",
            "duration_minutes", "block_type", "required_resources",
            "power_isolation_required", "line_configuration", "status",
            "data_quality_status", "freshness_timestamp",
        ):
            assert field in job, f"canonical field {field} missing"

    def test_jobs_filters(self, client):
        res = client.get("/api/jobs", params={"corridor_id": "C1", "data_quality": "READY"})
        body = res.json()
        for job in body["payload"]["jobs"]:
            assert job["corridor_id"] == "C1"
            assert job["data_quality_status"] == "READY"

    def test_trains(self, client):
        res = client.get("/api/trains")
        assert res.status_code == 200
        body = res.json()
        assert body["payload"]["count"] > 0
        train = body["payload"]["trains"][0]
        for field in ("train_id", "train_type", "corridor_id", "protected", "entry_time", "exit_time"):
            assert field in train

    def test_trains_protected_filter(self, client):
        res = client.get("/api/trains", params={"protected": "true"})
        body = res.json()
        for train in body["payload"]["trains"]:
            assert train["protected"] is True

    def test_blocks(self, client):
        res = client.get("/api/blocks")
        assert res.status_code == 200
        body = res.json()
        assert body["payload"]["count"] > 0
        block = body["payload"]["blocks"][0]
        for field in ("window_id", "block_id", "corridor_id", "block_type", "status", "duration_minutes"):
            assert field in block

    def test_network(self, client):
        res = client.get("/api/network")
        assert res.status_code == 200
        payload = res.json()["payload"]
        assert len(payload["corridors"]) >= 5
        assert len(payload["sections"]) >= 1
        assert len(payload["resources"]) >= 1

    def test_ingest(self, client):
        res = client.post("/api/ingest", params={"force": "true"})
        assert res.status_code == 200
        body = res.json()
        assert body["payload"]["job_count"] > 0
        assert body["payload"]["sources_loaded"]

    def test_validate(self, client):
        res = client.post("/api/validate")
        assert res.status_code == 200
        body = res.json()
        assert set(body["payload"]["counts"]) == {"ready", "review_required", "stale", "invalid"}
        validation = body["payload"]["validation"]
        assert validation
        some_id = next(iter(validation))
        assert "status" in validation[some_id]
        assert "messages" in validation[some_id]

    def test_validate_filters_by_job_id(self, client):
        res = client.post("/api/validate", params={"job_ids": ["TMS-ENG-9001"]})
        body = res.json()
        assert set(body["payload"]["validation"]) == {"TMS-ENG-9001"}


class TestBlockCompatibilityEndpoint:
    def test_tdms_job_rejects_traffic_block(self, client):
        res = client.get(
            "/api/jobs/TDMS-OHE-771/block-compatibility",
            params={"block_type": "TRAFFIC"},
        )
        body = res.json()
        assert body["payload"]["compatible"] is False
        assert body["payload"]["line_feasibility"]["both_directions_impacted"] is True

    def test_tdms_job_accepts_power_block(self, client):
        res = client.get(
            "/api/jobs/TDMS-OHE-771/block-compatibility",
            params={"block_type": "POWER"},
        )
        body = res.json()
        assert body["payload"]["compatible"] is True
        assert body["payload"]["feasible_block_types"]

    def test_unknown_job_is_error(self, client):
        res = client.get("/api/jobs/NOPE/block-compatibility", params={"block_type": "TRAFFIC"})
        body = res.json()
        assert body["status"] == "ERROR"
        assert body["errors"][0]["code"] == "JOB_NOT_FOUND"

    def test_unknown_block_type_is_error(self, client):
        res = client.get(
            "/api/jobs/TMS-ENG-9001/block-compatibility",
            params={"block_type": "WIZARDRY"},
        )
        body = res.json()
        assert body["status"] == "ERROR"
        assert body["errors"][0]["code"] == "INVALID_BLOCK_TYPE"


class TestSingleDoubleLineViaApi:
    def test_single_line_job_reports_both_directions(self, client):
        res = client.get(
            "/api/jobs/TDMS-OHE-771/block-compatibility",
            params={"block_type": "POWER"},
        )
        line = res.json()["payload"]["line_feasibility"]
        assert line["both_directions_impacted"] is True   # DDU-BSB is single line
        assert line["adjacent_movement_may_continue"] is False

    def test_double_line_job_reports_adjacent_line(self, client):
        res = client.get(
            "/api/jobs/TMS-ENG-9001/block-compatibility",
            params={"block_type": "TRAFFIC"},
        )
        line = res.json()["payload"]["line_feasibility"]
        assert line["working_line"] == "UP"
        assert line["adjacent_line"] == "DOWN"


class TestRepositoryDesign:
    def test_memory_repository_is_default(self):
        assert isinstance(get_repository(), InMemoryRepository)

    def test_memory_repository_caches_world(self, repository):
        world1 = repository.load()
        world2 = repository.load()
        assert world1 is world2

    def test_refresh_rebuilds(self, repository):
        world1 = repository.load()
        world2 = repository.refresh()
        assert world1 is not world2
        assert len(world2.jobs) == len(world1.jobs)

    def test_seed_data_loads_completely(self, world):
        assert len(world.jobs) >= 20
        assert len(world.trains) >= 5
        assert len(world.blocks) >= 5
        assert len(world.corridors) == 6
        assert len(world.sections) >= 5
        assert len(world.resources) >= 5
        assert world.report is not None
        assert not world.adapter_errors

    def test_sources_have_deliberately_different_vocabularies(self, world):
        systems = {j.source_system for j in world.jobs}
        assert systems == {"TMS", "SMMS", "TDMS", "BDMS"}
