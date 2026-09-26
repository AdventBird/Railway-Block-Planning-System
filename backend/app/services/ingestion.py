"""Feature 1 — synthetic multi-source ingestion.

Loads the seeded source datasets (each with deliberately different field
names and formats), runs every record through its adapter, and produces the
unified canonical world state plus a data-quality report.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.app import config
from backend.app.adapters import (
    COAAdapter,
    SMMSAdapter,
    TDMSAdapter,
    TMSAdapter,
    TimetableAdapter,
)
from backend.app.rules.data_quality import DataQualityEngine, DataQualityReport
from backend.app.schemas import (
    BlockWindow,
    Corridor,
    MaintenanceJob,
    Resource,
    Section,
    TrainMovement,
)


@dataclass
class IngestionResult:
    """Canonical world state produced by one full ingestion pass."""

    jobs: List[MaintenanceJob] = field(default_factory=list)
    trains: List[TrainMovement] = field(default_factory=list)
    blocks: List[BlockWindow] = field(default_factory=list)
    resources: List[Resource] = field(default_factory=list)
    corridors: List[Corridor] = field(default_factory=list)
    sections: List[Section] = field(default_factory=list)
    report: Optional[DataQualityReport] = None
    sources_loaded: List[str] = field(default_factory=list)
    adapter_errors: List[Dict[str, str]] = field(default_factory=list)
    source_profiles: Dict[str, Any] = field(default_factory=dict)
    quality_breakdown: Dict[str, Any] = field(default_factory=dict)

    @property
    def data_quality_summary(self) -> Dict[str, int]:
        if self.report is None:
            return {}
        return dict(self.report.counts)


class IngestionService:
    """Orchestrates the five source adapters over the seeded datasets."""

    def __init__(self, data_dir: Optional[Path] = None, validate: bool = True) -> None:
        self._data_dir = Path(data_dir) if data_dir else config.DATA_DIR
        self._validate = validate
        self._tms = TMSAdapter()
        self._smms = SMMSAdapter()
        self._tdms = TDMSAdapter()
        self._coa = COAAdapter()
        self._timetable = TimetableAdapter()
        self._dq = DataQualityEngine()

    # ------------------------------------------------------------------ load

    def _load_json(self, filename: str) -> Dict[str, Any]:
        path = self._data_dir / filename
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    def ingest(self) -> IngestionResult:
        """Run the full deterministic ingestion pipeline."""
        result = IngestionResult()

        # -- TMS (engineering defects) ------------------------------------
        tms_payload = self._load_json("tms_defects.json")
        tms_records = tms_payload.get("records", [])
        result.sources_loaded.append(f"TMS:{len(tms_records)}")
        for job in self._safe(lambda: self._tms.to_jobs(tms_records), "TMS", result):
            result.jobs.append(job)

        # -- SMMS (S&T incidents) ------------------------------------------
        smms_payload = self._load_json("smms_incidents.json")
        smms_records = smms_payload.get("records", [])
        result.sources_loaded.append(f"SMMS:{len(smms_records)}")
        for job in self._safe(lambda: self._smms.to_jobs(smms_records), "SMMS", result):
            result.jobs.append(job)

        # -- TDMS (traction / OHE) ------------------------------------------
        tdms_payload = self._load_json("tdms_ohe.json")
        tdms_records = tdms_payload.get("records", [])
        result.sources_loaded.append(f"TDMS:{len(tdms_records)}")
        for job in self._safe(lambda: self._tdms.to_jobs(tdms_records), "TDMS", result):
            result.jobs.append(job)

        # -- COA (block register) + BDMS (bridge records) -------------------
        coa_payload = self._load_json("coa_blocks.json")
        coa_records = coa_payload.get("blocks", [])
        bdms_records = coa_payload.get("bdms_records", [])
        result.sources_loaded.append(f"COA:{len(coa_records)}")
        result.sources_loaded.append(f"BDMS:{len(bdms_records)}")
        for block in self._safe(lambda: self._coa.to_blocks(coa_records), "COA", result):
            result.blocks.append(block)
        for job in self._safe(lambda: self._coa.to_jobs(bdms_records), "BDMS", result):
            result.jobs.append(job)

        # -- Timetable -------------------------------------------------------
        tt_payload = self._load_json("timetable.json")
        tt_records = tt_payload.get("records", [])
        result.sources_loaded.append(f"TIMETABLE:{len(tt_records)}")
        for train in self._safe(lambda: self._timetable.to_trains(tt_records), "TIMETABLE", result):
            result.trains.append(train)

        # -- Network reference data (already canonical) -----------------------
        network = self._load_json("network.json")
        result.corridors = [Corridor(**c) for c in network.get("corridors", [])]
        result.sections = [Section(**s) for s in network.get("sections", [])]
        result.resources = [Resource(**r) for r in network.get("resources", [])]

        # -- deterministic validation pass ------------------------------------
        if self._validate:
            result.report = self._dq.validate_all(result.jobs, result.blocks, result.trains)

        # -- pandas profiling of the raw sources --------------------------------
        from backend.app.services.profiling import profile_sources, quality_breakdown

        result.source_profiles = profile_sources(self._data_dir)
        result.quality_breakdown = quality_breakdown(result.jobs)

        return result

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _safe(loader, source: str, result: IngestionResult):
        """Run an adapter, collecting AdapterErrors without aborting the pass."""
        try:
            return loader()
        except Exception as exc:  # adapter contract violation
            result.adapter_errors.append({"source": source, "error": str(exc)})
            return []
