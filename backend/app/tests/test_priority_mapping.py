"""Tests for Feature 5 — cross-department priority normalisation.

Core guarantee: departmental labels are never compared directly — each
source system's vocabulary goes through the configurable mapping.
"""

from __future__ import annotations

import json

import pytest

from backend.app.adapters.mapping import (
    PriorityUnmapped,
    load_priority_config,
    normalise_asset_criticality,
    normalise_department,
    normalise_line_configuration,
    normalise_operational_impact,
    normalise_safety_consequence,
    normalise_urgency,
    normalise_working_line,
)
from backend.app.schemas import LineConfiguration, WorkingLine


class TestPriorityMapping:
    def test_config_loads_and_is_seeded(self):
        cfg = load_priority_config()
        assert cfg["version"]
        for table in ("safety_consequence", "asset_criticality", "urgency", "operational_impact"):
            assert table in cfg

    def test_p1_maps_to_immediate(self):
        assert normalise_urgency("P1", "SMMS") == "IMMEDIATE"

    def test_tms_urgent_maps_to_immediate(self):
        assert normalise_urgency("URGENT", "TDMS") == "IMMEDIATE"

    def test_same_word_different_meaning_per_system(self):
        """'MAJOR' means speed restriction in TMS but the SMMS mapping is
        separate — the systems are never compared through one global table."""
        cfg = load_priority_config()
        assert cfg["safety_consequence"]["TMS"]["MAJOR"] == "SPEED_RESTRICTION"
        assert cfg["safety_consequence"]["SMMS"]["MAJOR"] == "SPEED_RESTRICTION"

    def test_unknown_label_raises_priority_unmapped(self):
        """Unknown priority labels are NEVER silently downgraded to a safe
        default (PRIORITY_UNMAPPED policy)."""
        with pytest.raises(PriorityUnmapped):
            normalise_urgency("SUPER-ULTRA", "TMS")
        with pytest.raises(PriorityUnmapped):
            normalise_safety_consequence("???", "SMMS")

    def test_blank_descriptive_labels_fall_back(self):
        """Only non-priority descriptive fields may use defaults when absent."""
        assert normalise_asset_criticality(None, "TDMS") == "DISCRETIONARY"
        assert normalise_operational_impact("", "TMS") == "LOCAL"

    def test_department_aliases(self):
        assert normalise_department("P-WAY") == "Engineering"
        assert normalise_department("SIGNAL") == "S&T"
        assert normalise_department("OHE") == "TRD"
        assert normalise_department("ENGINEERING") == "Engineering"

    def test_operational_impact_scope_mapping(self):
        assert normalise_operational_impact("SECTION", "TMS") == "LOCAL"
        assert normalise_operational_impact("NETWORK", "SMMS") == "NETWORK"

    def test_line_configuration_parsing(self):
        assert normalise_line_configuration("DOUBLE line") == LineConfiguration.DOUBLE
        assert normalise_line_configuration("single") == LineConfiguration.SINGLE
        assert normalise_line_configuration("") == LineConfiguration.SINGLE

    def test_working_line_respects_section_layout(self):
        single = LineConfiguration.SINGLE
        double = LineConfiguration.DOUBLE
        assert normalise_working_line("UP", double) == WorkingLine.UP
        assert normalise_working_line("DN", double) == WorkingLine.DOWN
        # A single line has no direction choice — always SINGLE.
        assert normalise_working_line("UP", single) == WorkingLine.SINGLE

    def test_mapping_is_overridable(self, tmp_path):
        """Operators retune priorities by editing the config, not the code."""
        custom = {
            "departments": {"ENGINEERING": "Engineering"},
            "safety_consequence": {"TMS": {"MINOR": "IMMEDIATE_HALT"}},
            "asset_criticality": {"TMS": {}},
            "urgency": {"TMS": {}},
            "operational_impact": {"TMS": {}},
        }
        path = tmp_path / "custom_mapping.json"
        path.write_text(json.dumps(custom), encoding="utf-8")
        cfg = load_priority_config(path)
        assert cfg["safety_consequence"]["TMS"]["MINOR"] == "IMMEDIATE_HALT"

    def test_missing_config_file_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            load_priority_config(tmp_path / "nope.json")


class TestSeededWorldNormalisation:
    """The ingestion pipeline normalises every source through the mapping."""

    def test_all_jobs_have_canonical_attributes(self, world):
        for job in world.jobs:
            assert job.safety_consequence in ("IMMEDIATE_HALT", "SPEED_RESTRICTION", "ROUTINE")
            assert job.asset_criticality in ("SAFETY_CRITICAL", "ESSENTIAL", "DISCRETIONARY")
            assert job.urgency in ("IMMEDIATE", "HIGH", "NORMAL", "LOW")
            assert job.deadline_pressure in ("OVERDUE", "IMMEDIATE", "SHORT", "COMFORTABLE")
            assert job.operational_impact in ("NETWORK", "CORRIDOR", "LOCAL", "MINIMAL")
            assert job.department in ("Engineering", "S&T", "TRD")

    def test_no_numeric_scores_anywhere(self, world):
        """The priority model is categorical — no AI/percent scores."""
        for job in world.jobs:
            dumped = job.model_dump()
            for key in ("score", "priority_score", "confidence", "risk_score"):
                assert key not in dumped

    def test_overdue_jobs_flagged(self, world):
        overdue = [j for j in world.jobs if j.overdue]
        assert overdue, "seed data must exercise the overdue path"
        for job in overdue:
            assert job.deadline_pressure == "OVERDUE"
            assert job.overdue_days > 0
