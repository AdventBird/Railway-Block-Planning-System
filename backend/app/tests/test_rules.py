"""Tests for Features 9 & 10 — block taxonomy and line configuration rules."""

from __future__ import annotations

import pytest

from backend.app.rules.blocks import BlockRuleEngine
from backend.app.rules.line_config import LineConfigEngine
from backend.app.schemas import BlockType, Section

from backend.app.tests.conftest import make_job


class TestBlockTaxonomy:
    """Feature 9 — TRAFFIC / POWER / POWER_AND_TRAFFIC compatibility."""

    def setup_method(self):
        self.engine = BlockRuleEngine()

    def test_traffic_job_fits_traffic_block(self):
        verdict = self.engine.check(make_job(block_type="TRAFFIC"), BlockType.TRAFFIC)
        assert verdict.compatible

    def test_traffic_job_rejected_on_power_block(self):
        verdict = self.engine.check(make_job(block_type="TRAFFIC"), BlockType.POWER)
        assert not verdict.compatible
        assert any(r.code == "NO_LINE_ACCESS" for r in verdict.reasons)

    def test_power_job_rejected_on_traffic_block(self):
        job = make_job(block_type="POWER", power_isolation_required=True)
        verdict = self.engine.check(job, BlockType.TRAFFIC)
        assert not verdict.compatible
        codes = {r.code for r in verdict.reasons}
        assert "ISOLATION_NOT_GRANTED" in codes

    def test_power_job_fits_power_and_traffic(self):
        job = make_job(block_type="POWER", power_isolation_required=True)
        assert self.engine.check(job, BlockType.POWER_AND_TRAFFIC).compatible

    def test_tdms_job_never_safe_under_plain_traffic(self):
        """A double-line section does NOT make traction work under a traffic
        block safe — the OHE would still be energised."""
        job = make_job(
            source_system="TDMS",
            block_type="POWER",
            power_isolation_required=True,
            line_configuration="DOUBLE",
            working_line="UP",
        )
        verdict = self.engine.check(job, BlockType.TRAFFIC)
        assert not verdict.compatible
        assert any(r.code == "TRACTION_UNDER_TRAFFIC" for r in verdict.reasons)

    def test_combined_block_covers_everything(self):
        for required in ("TRAFFIC", "POWER", "POWER_AND_TRAFFIC"):
            job = make_job(
                block_type=required,
                power_isolation_required=required in ("POWER", "POWER_AND_TRAFFIC"),
            )
            if required == "POWER":
                # TRD job under a combined block is fine.
                job = make_job(block_type="POWER", power_isolation_required=True)
            verdict = self.engine.check(job, BlockType.POWER_AND_TRAFFIC)
            assert verdict.compatible, required

    def test_feasible_block_types_lists_all_options(self):
        job = make_job(block_type="TRAFFIC", power_isolation_required=False)
        feasible = self.engine.feasible_block_types(job)
        assert BlockType.TRAFFIC in feasible
        assert BlockType.POWER_AND_TRAFFIC in feasible
        assert BlockType.POWER not in feasible

    def test_unknown_block_type_string_raises(self):
        with pytest.raises(ValueError):
            self.engine.check(make_job(), "MAGNETIC_LEVITATION")


class TestLineConfiguration:
    """Feature 10 — single/double line behaviour."""

    def setup_method(self):
        self.engine = LineConfigEngine()

    # ------------------------------------------------------------- single line

    def test_single_line_impacts_both_directions(self):
        job = make_job(line_configuration="SINGLE", working_line="SINGLE")
        verdict = self.engine.check(job)
        assert verdict.feasible
        assert verdict.both_directions_impacted is True
        assert verdict.adjacent_line is None
        assert verdict.adjacent_movement_may_continue is False
        assert any(n.code == "SINGLE_LINE_BOTH_DIRECTIONS" for n in verdict.reasons)

    # ------------------------------------------------------------ double line

    def test_double_line_with_adjacent_line_open(self):
        job = make_job(
            line_configuration="DOUBLE", working_line="UP",
            adjacent_line_operational=True, operational_impact="LOCAL",
            power_isolation_required=False,
        )
        verdict = self.engine.check(job)
        assert verdict.feasible
        assert verdict.working_line == "UP"
        assert verdict.adjacent_line == "DOWN"
        assert verdict.adjacent_movement_may_continue is True

    def test_double_line_requires_explicit_working_line(self):
        job = make_job(line_configuration="DOUBLE", working_line="SINGLE")
        verdict = self.engine.check(job)
        assert not verdict.feasible
        assert any(r.code == "WORKING_LINE_REQUIRED" for r in verdict.reasons)

    def test_double_line_is_not_automatically_safe(self):
        """A job claiming NETWORK impact while asserting adjacent movement
        continues must be flagged — the claim is contradictory."""
        job = make_job(
            line_configuration="DOUBLE", working_line="UP",
            adjacent_line_operational=True, operational_impact="NETWORK",
            power_isolation_required=False,
        )
        verdict = self.engine.check(job)
        assert verdict.feasible is False or any(
            r.code == "ADJACENT_LINE_RISK" for r in verdict.reasons
        )
        assert verdict.adjacent_movement_may_continue is False

    def test_power_isolation_blocks_adjacent_movement_claim(self):
        job = make_job(
            line_configuration="DOUBLE", working_line="UP",
            adjacent_line_operational=True,
            power_isolation_required=True, block_type="POWER",
            operational_impact="LOCAL",
        )
        verdict = self.engine.check(job)
        assert any(r.code == "ADJACENT_LINE_POWER_RISK" for r in verdict.reasons)
        assert verdict.adjacent_movement_may_continue is False

    def test_working_line_must_exist_on_section(self):
        section = Section(
            section_id="SEC-TEST",
            name="Test section",
            corridor_id="C1",
            from_station_id="NDLS",
            to_station_id="GZB",
            line_configuration="DOUBLE",
            lines=["UP", "DOWN"],
        )
        # A single-line job dropped onto a double-line section has no working
        # line — the section cross-check must reject it.
        job = make_job(line_configuration="SINGLE", working_line="SINGLE")
        verdict = self.engine.check(job, section)
        assert not verdict.feasible

    def test_section_mismatch_is_error(self):
        section = Section(
            section_id="SEC-TEST",
            name="Test section",
            corridor_id="C1",
            from_station_id="NDLS",
            to_station_id="GZB",
            line_configuration="DOUBLE",
            lines=["DOWN"],
        )
        job = make_job(line_configuration="DOUBLE", working_line="UP")
        verdict = self.engine.check(job, section)
        assert not verdict.feasible
        assert any(r.code == "WORKING_LINE_NOT_IN_SECTION" for r in verdict.reasons)
