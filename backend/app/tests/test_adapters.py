"""Tests for the five source adapters (Features 1 & 2).

Each adapter must normalise its source vocabulary into canonical models,
flag dirty records instead of crashing, and reject records that violate
the adapter contract outright.
"""

from __future__ import annotations

import pytest

from backend.app.adapters import (
    COAAdapter,
    SMMSAdapter,
    TDMSAdapter,
    TMSAdapter,
    TimetableAdapter,
)
from backend.app.adapters.base import AdapterError
from backend.app.schemas import BlockType, DataQualityStatus


# ---------------------------------------------------------------------------
# TMS
# ---------------------------------------------------------------------------


class TestTMSAdapter:
    def test_canonical_conversion(self):
        records = [{
            "defect_id": "ENG-1", "section": "NDLS-GZB", "severity": "CRITICAL",
            "defect_type": "WELD", "due_date": "2026-09-16T04:00:00+05:30",
            "duration_minutes": 90, "block_type": "TRAFFIC",
            "line_configuration": "DOUBLE", "working_line": "UP",
            "priority": "IMMEDIATE", "asset_class": "TRACK", "scope": "CORRIDOR",
            "last_synced_at": "2026-09-14T17:00:00+05:30",
        }]
        jobs = TMSAdapter().to_jobs(records)
        assert len(jobs) == 1
        job = jobs[0]
        assert job.job_id == "TMS-ENG-1"
        assert job.source_system == "TMS"
        assert job.corridor_id == "C1"
        assert job.safety_consequence == "IMMEDIATE_HALT"
        assert job.urgency == "IMMEDIATE"
        assert job.block_type == BlockType.TRAFFIC
        assert job.duration_minutes == 90
        assert job.data_quality_status == DataQualityStatus.READY

    def test_unknown_section_is_invalid_not_crash(self):
        records = [{
            "defect_id": "ENG-2", "section": "NOWHERE", "severity": "MINOR",
            "duration_minutes": 30, "block_type": "TRAFFIC",
            "line_configuration": "DOUBLE", "working_line": "UP",
            "last_synced_at": "2026-09-14T17:00:00+05:30",
        }]
        jobs = TMSAdapter().to_jobs(records)
        assert jobs[0].data_quality_status == DataQualityStatus.INVALID
        assert any(m.code == "INVALID_CORRIDOR" for m in jobs[0].data_quality_messages)

    def test_missing_duration_is_invalid(self):
        records = [{
            "defect_id": "ENG-3", "section": "NDLS-GZB", "severity": "MINOR",
            "duration_minutes": None, "block_type": "TRAFFIC",
            "line_configuration": "DOUBLE", "working_line": "UP",
            "last_synced_at": "2026-09-14T17:00:00+05:30",
        }]
        jobs = TMSAdapter().to_jobs(records)
        assert jobs[0].duration_minutes is None
        assert any(m.code == "MISSING_DURATION" for m in jobs[0].data_quality_messages)

    def test_missing_id_raises_adapter_error(self):
        with pytest.raises(AdapterError):
            TMSAdapter().to_jobs([{"severity": "MINOR"}])

    def test_overdue_computation(self):
        records = [{
            "defect_id": "ENG-4", "section": "TDL-CNB", "severity": "MAJOR",
            "due_date": "2026-09-10T00:00:00+05:30", "duration_minutes": 60,
            "block_type": "TRAFFIC", "line_configuration": "DOUBLE",
            "working_line": "DOWN",
            "last_synced_at": "2026-09-14T17:00:00+05:30",
        }]
        job = TMSAdapter().to_jobs(records)[0]
        assert job.overdue is True
        assert job.overdue_days >= 4
        assert job.deadline_pressure == "OVERDUE"

    def test_deadline_pressure_boundaries(self):
        """Operational clock is 2026-09-14T18:00 IST: <=24 h is IMMEDIATE,
        <=7 d is SHORT, beyond is COMFORTABLE (adapter base class shared)."""
        adapter = TMSAdapter()
        base = dict(section="TDL-CNB", severity="MINOR", duration_minutes=60,
                    block_type="TRAFFIC", line_configuration="DOUBLE",
                    working_line="UP", last_synced_at="2026-09-14T17:00:00+05:30")
        records = [
            {"defect_id": "ENG-A", "due_date": "2026-09-15T17:00:00+05:30", **base},  # 23 h
            {"defect_id": "ENG-B", "due_date": "2026-09-20T17:00:00+05:30", **base},  # 5 d 23 h
            {"defect_id": "ENG-C", "due_date": "2026-09-30T00:00:00+05:30", **base},  # 15 d
        ]
        jobs = adapter.to_jobs(records)
        assert jobs[0].deadline_pressure == "IMMEDIATE"
        assert jobs[1].deadline_pressure == "SHORT"
        assert jobs[2].deadline_pressure == "COMFORTABLE"


# ---------------------------------------------------------------------------
# SMMS
# ---------------------------------------------------------------------------


class TestSMMSAdapter:
    def test_canonical_conversion(self):
        records = [{
            "incident_no": "SIG-1", "location": "TDL-CNB", "condition": "CRITICAL",
            "priority_label": "P1", "work_time": 60, "target_date": "2026-09-15T02:00:00+05:30",
            "block_requested": True, "power_block_required": False,
            "line_configuration": "DOUBLE", "working_line": "UP",
            "last_synced_at": "2026-09-14T17:00:00+05:30",
        }]
        jobs = SMMSAdapter().to_jobs(records)
        job = jobs[0]
        assert job.job_id == "SMMS-SIG-1"
        assert job.source_system == "SMMS"
        assert job.urgency == "IMMEDIATE"      # P1 via mapping, not compared to TMS
        assert job.safety_consequence == "IMMEDIATE_HALT"
        assert job.block_type == BlockType.TRAFFIC

    def test_power_block_flag_selects_power_block(self):
        records = [{
            "incident_no": "SIG-2", "location": "PRYJ-DDU", "condition": "MAJOR",
            "priority_label": "P2", "work_time": 180,
            "block_requested": True, "power_block_required": True,
            "line_configuration": "DOUBLE", "working_line": "UP",
            "last_synced_at": "2026-09-14T17:00:00+05:30",
        }]
        job = SMMSAdapter().to_jobs(records)[0]
        assert job.block_type == BlockType.POWER_AND_TRAFFIC
        assert job.power_isolation_required is True

    def test_missing_block_request_is_invalid(self):
        records = [{
            "incident_no": "SIG-3", "location": "NDLS-GZB", "condition": "MINOR",
            "priority_label": "P3", "work_time": 30, "block_requested": False,
            "power_block_required": False,
            "line_configuration": "DOUBLE", "working_line": "UP",
            "last_synced_at": "2026-09-14T17:00:00+05:30",
        }]
        job = SMMSAdapter().to_jobs(records)[0]
        assert job.data_quality_status == DataQualityStatus.INVALID
        assert any(m.code == "MISSING_BLOCK_TYPE" for m in job.data_quality_messages)

    def test_missing_id_raises_adapter_error(self):
        with pytest.raises(AdapterError):
            SMMSAdapter().to_jobs([{"work_time": 10}])

    def test_stale_record_flagged(self):
        records = [{
            "incident_no": "SIG-4", "location": "NDLS-GZB", "condition": "MINOR",
            "priority_label": "P3", "work_time": 30, "block_requested": True,
            "power_block_required": False, "line_configuration": "DOUBLE",
            "working_line": "UP",
            "last_synced_at": "2026-09-10T10:00:00+05:30",
        }]
        job = SMMSAdapter().to_jobs(records)[0]
        assert any(m.code == "STALE_RECORD" for m in job.data_quality_messages)


# ---------------------------------------------------------------------------
# TDMS
# ---------------------------------------------------------------------------


class TestTDMSAdapter:
    def test_canonical_conversion(self):
        records = [{
            "asset_ref": "OHE-1", "corridor": "DDU-BSB", "consequence": "IMMEDIATE_HALT",
            "asset_class": "OHE", "urgency": "URGENT", "duration": 120,
            "due_by": "2026-09-15T05:45:00+05:30", "isolation_required": "yes",
            "line_configuration": "SINGLE",
            "last_synced_at": "2026-09-14T17:00:00+05:30",
        }]
        jobs = TDMSAdapter().to_jobs(records)
        job = jobs[0]
        assert job.job_id == "TDMS-OHE-1"
        assert job.source_system == "TDMS"
        assert job.corridor_id == "C5"
        assert job.block_type == BlockType.POWER
        assert job.power_isolation_required is True
        assert job.line_configuration == "SINGLE"
        assert job.safety_consequence == "IMMEDIATE_HALT"
        assert job.data_quality_status == DataQualityStatus.READY

    def test_isolation_missing_is_flagged(self):
        records = [{
            "asset_ref": "OHE-2", "corridor": "PRYJ-DDU", "duration": 60,
            "isolation_required": None, "line_configuration": "DOUBLE",
            "working_line": "UP", "urgency": "ROUTINE",
            "last_synced_at": "2026-09-14T17:00:00+05:30",
        }]
        job = TDMSAdapter().to_jobs(records)[0]
        assert any(m.code == "MISSING_ISOLATION_INFO" for m in job.data_quality_messages)

    def test_unknown_corridor_is_invalid(self):
        records = [{
            "asset_ref": "OHE-3", "corridor": "MARS-BASE", "duration": 60,
            "isolation_required": "yes", "line_configuration": "DOUBLE",
            "working_line": "UP",
            "last_synced_at": "2026-09-14T17:00:00+05:30",
        }]
        job = TDMSAdapter().to_jobs(records)[0]
        assert job.data_quality_status == DataQualityStatus.INVALID
        assert any(m.code == "INVALID_CORRIDOR" for m in job.data_quality_messages)

    def test_missing_ref_raises_adapter_error(self):
        with pytest.raises(AdapterError):
            TDMSAdapter().to_jobs([{"duration": 60}])


# ---------------------------------------------------------------------------
# COA (blocks) & BDMS (bridge jobs)
# ---------------------------------------------------------------------------


class TestCOAAdapter:
    def test_block_conversion(self):
        records = [{
            "block_id": "BLK-1", "corridor": "DDU-BSB", "start": "02:00",
            "end": "05:30", "block_type": "P&T", "status": "sanctioned",
            "last_synced_at": "2026-09-14T18:00:00+05:30",
        }]
        blocks = COAAdapter().to_blocks(records)
        assert len(blocks) == 1
        block = blocks[0]
        assert block.window_id == "BLK-1"
        assert block.corridor_id == "C5"
        assert block.block_type == BlockType.POWER_AND_TRAFFIC
        assert block.status == "approved"
        assert block.duration_minutes == 210
        assert block.data_quality_status == DataQualityStatus.READY

    def test_midnight_crossing_block(self):
        records = [{
            "block_id": "BLK-2", "corridor": "TDL-CNB", "start": "23:30",
            "end": "03:00", "block_type": "TRAFFIC", "status": "pending",
            "last_synced_at": "2026-09-14T18:00:00+05:30",
        }]
        block = COAAdapter().to_blocks(records)[0]
        assert block.duration_minutes == 210

    def test_malformed_block_is_invalid(self):
        records = [{
            "block_id": "BLK-3", "corridor": "XXX", "start": "25:99",
            "end": "nope", "block_type": "MYSTERY", "status": "?",
            "last_synced_at": "2026-09-14T18:00:00+05:30",
        }]
        block = COAAdapter().to_blocks(records)[0]
        assert block.data_quality_status == DataQualityStatus.INVALID
        codes = {m.code for m in block.data_quality_messages}
        assert "INVALID_TIME" in codes
        assert "INVALID_CORRIDOR" in codes
        assert "MISSING_BLOCK_TYPE" in codes

    def test_bdms_job_conversion(self):
        records = [{
            "bridge_ref": "BR-41", "corridor": "PRYJ-DDU", "condition": "MAJOR",
            "asset_class": "BRIDGE", "urgency": "MANDATORY", "work_time": 120,
            "due_date": "2026-09-30T00:00:00+05:30", "block_type": "TRAFFIC",
            "line_configuration": "DOUBLE", "working_line": "UP",
            "last_synced_at": "2026-09-14T14:00:00+05:30",
        }]
        jobs = COAAdapter().to_jobs(records)
        job = jobs[0]
        assert job.job_id == "BDMS-BR-41"
        assert job.source_system == "BDMS"
        assert job.department == "Engineering"
        assert job.urgency == "HIGH"  # MANDATORY via mapping
        assert job.data_quality_status == DataQualityStatus.READY

    def test_missing_block_id_raises(self):
        with pytest.raises(AdapterError):
            COAAdapter().to_blocks([{"corridor": "TDL-CNB"}])

    def test_end_before_start_is_invalid(self):
        """A block whose end precedes its start (beyond midnight tolerance)
        must be flagged, not silently wrapped."""
        records = [{
            "block_id": "BLK-4", "corridor": "NDLS-GZB", "start": "22:00",
            "end": "21:00", "block_type": "TRAFFIC", "status": "proposed",
            "last_synced_at": "2026-09-14T18:00:00+05:30",
        }]
        block = COAAdapter().to_blocks(records)[0]
        assert block.data_quality_status == DataQualityStatus.INVALID
        assert any(m.code == "INVALID_TIME" for m in block.data_quality_messages)


# ---------------------------------------------------------------------------
# Timetable
# ---------------------------------------------------------------------------


class TestTimetableAdapter:
    def test_canonical_conversion(self):
        records = [{
            "train_id": "TT-1", "train_number": "12951", "train_type": "passenger",
            "corridor": "NDLS-GZB", "entry_time": "22:50", "exit_time": "23:50",
            "protected": True,
        }]
        trains = TimetableAdapter().to_trains(records)
        assert len(trains) == 1
        train = trains[0]
        assert train.train_id == "TT-1"
        assert train.corridor_id == "C1"
        assert train.protected is True
        assert train.data_quality_status == DataQualityStatus.READY

    def test_malformed_row_is_invalid(self):
        records = [{
            "train_id": "TT-BAD", "train_type": "cargo", "corridor": "ZZZ",
            "entry_time": "99:99", "exit_time": "", "protected": "maybe",
        }]
        trains = TimetableAdapter().to_trains(records)
        train = trains[0]
        assert train.data_quality_status == DataQualityStatus.INVALID
        codes = {m.code for m in train.data_quality_messages}
        assert "INVALID_TIME" in codes
        assert "INVALID_CORRIDOR" in codes

    def test_protected_flag_string_parsing(self):
        records = [{
            "train_id": "TT-2", "train_type": "freight", "corridor": "TDL-CNB",
            "entry_time": "00:40", "exit_time": "02:10", "protected": "yes",
        }]
        train = TimetableAdapter().to_trains(records)[0]
        assert train.protected is True

    def test_missing_train_id_raises(self):
        with pytest.raises(AdapterError):
            TimetableAdapter().to_trains([{"entry_time": "01:00"}])
