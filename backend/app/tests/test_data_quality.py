"""Tests for Feature 3 — deterministic data quality / freshness validation."""

from __future__ import annotations

from backend.app.rules.data_quality import DataQualityEngine
from backend.app.schemas import DataQualityStatus

from backend.app.tests.conftest import make_job


class TestDataQualityEngine:
    def setup_method(self):
        self.engine = DataQualityEngine()

    def test_ready_job_passes_clean(self):
        status, messages = self.engine.validate_job(make_job())
        assert status == DataQualityStatus.READY
        assert messages == []

    def test_missing_duration_is_invalid(self):
        status, messages = self.engine.validate_job(make_job(duration_minutes=None))
        assert status == DataQualityStatus.INVALID
        assert any(m.code == "MISSING_DURATION" and m.severity == "ERROR" for m in messages)

    def test_zero_duration_is_invalid(self):
        status, messages = self.engine.validate_job(make_job(duration_minutes=0))
        assert status == DataQualityStatus.INVALID

    def test_missing_block_type_is_invalid(self):
        status, messages = self.engine.validate_job(make_job(block_type=None))
        assert status == DataQualityStatus.INVALID
        assert any(m.code == "MISSING_BLOCK_TYPE" for m in messages)

    def test_invalid_corridor_is_invalid(self):
        status, messages = self.engine.validate_job(make_job(corridor_id="C99"))
        assert status == DataQualityStatus.INVALID
        assert any(m.code == "INVALID_CORRIDOR" for m in messages)

    def test_invalid_resource_is_review_required(self):
        status, messages = self.engine.validate_job(
            make_job(required_resources=["Unknown ghost machine"])
        )
        assert status == DataQualityStatus.REVIEW_REQUIRED
        assert any(m.code == "INVALID_RESOURCE" for m in messages)

    def test_stale_record_becomes_stale(self):
        status, messages = self.engine.validate_job(
            make_job(freshness_timestamp="2026-09-10T10:00:00+05:30")
        )
        assert status == DataQualityStatus.STALE
        assert any(m.code == "STALE_RECORD" for m in messages)

    def test_missing_freshness_becomes_stale(self):
        status, messages = self.engine.validate_job(make_job(freshness_timestamp=None))
        assert status == DataQualityStatus.STALE
        assert any(m.code == "MISSING_FRESHNESS" for m in messages)

    def test_invalid_deadline_warns(self):
        status, messages = self.engine.validate_job(make_job(deadline=None))
        assert status == DataQualityStatus.REVIEW_REQUIRED
        assert any(m.code == "INVALID_DEADLINE" for m in messages)

    def test_isolation_mismatch_is_invalid(self):
        status, messages = self.engine.validate_job(
            make_job(power_isolation_required=True, block_type="TRAFFIC")
        )
        assert status == DataQualityStatus.INVALID
        assert any(m.code == "MISSING_ISOLATION_INFO" for m in messages)

    def test_tdms_without_isolation_flag_warns(self):
        status, messages = self.engine.validate_job(
            make_job(
                source_system="TDMS",
                power_isolation_required=False,
                block_type="POWER",
            )
        )
        assert status == DataQualityStatus.REVIEW_REQUIRED
        assert any(m.code == "MISSING_ISOLATION_INFO" for m in messages)

    def test_double_line_without_working_line_warns(self):
        status, messages = self.engine.validate_job(
            make_job(line_configuration="DOUBLE", working_line="SINGLE")
        )
        assert status == DataQualityStatus.REVIEW_REQUIRED
        assert any(m.code == "INVALID_LINE_CONFIG" for m in messages)

    def test_severity_ordering(self):
        """ERROR beats stale/warning: a record with both is INVALID."""
        status, _ = self.engine.validate_job(
            make_job(duration_minutes=None, freshness_timestamp="2026-09-01T00:00:00+05:30")
        )
        assert status == DataQualityStatus.INVALID

    def test_validate_all_aggregates_counts(self, world):
        report = world.report
        assert report is not None
        total = sum(report.counts.values())
        assert total == len(world.jobs) + len(world.blocks) + len(world.trains)
        assert report.counts["invalid"] >= 1   # dirty seeds exercise the rules
        assert report.counts["stale"] >= 1
        assert report.counts["ready"] >= 1

    def test_blocking_excludes_invalid_and_stale(self, world):
        blocking = set(world.report.blocking)
        for job in world.jobs:
            if job.data_quality_status in (DataQualityStatus.INVALID, DataQualityStatus.STALE):
                assert job.job_id in blocking
            else:
                assert job.job_id not in blocking
