"""Pandas-based source profiling.

Uses pandas to profile the raw source datasets before/after normalisation:
row counts, null rates and per-corridor job distributions. This gives the
ingestion report a data-analysis backbone without introducing pandas into
the canonical model layer (adapters and schemas stay pydantic-native).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

from backend.app import config
from backend.app.schemas import MaintenanceJob

#: Raw source files and the field carrying each record's primary key.
SOURCE_FILES: Dict[str, Dict[str, str]] = {
    "TMS": {"file": "tms_defects.json", "records": "records", "id": "defect_id"},
    "SMMS": {"file": "smms_incidents.json", "records": "records", "id": "incident_no"},
    "TDMS": {"file": "tdms_ohe.json", "records": "records", "id": "asset_ref"},
    "COA": {"file": "coa_blocks.json", "records": "blocks", "id": "block_id"},
    "BDMS": {"file": "coa_blocks.json", "records": "bdms_records", "id": "bridge_ref"},
    "TIMETABLE": {"file": "timetable.json", "records": "records", "id": "train_id"},
}


def load_source_frame(source: str, data_dir: Optional[Path] = None) -> pd.DataFrame:
    """Load one raw source dataset as a DataFrame (deliberately ragged schema)."""
    meta = SOURCE_FILES[source]
    path = (data_dir or config.DATA_DIR) / meta["file"]
    # Parse with stdlib json first: the files hold several arrays of different
    # lengths (records/blocks/bdms_records), which pd.read_json cannot infer.
    with open(path, "r", encoding="utf-8") as fh:
        payload = json.load(fh)
    return pd.DataFrame(payload.get(meta["records"], []))


def profile_sources(data_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Per-source profiling: row counts and missing-field rates."""
    out: Dict[str, Any] = {}
    for source, meta in SOURCE_FILES.items():
        frame = load_source_frame(source, data_dir)
        missing = frame.isna().mean().round(4)
        out[source] = {
            "rows": int(len(frame)),
            "fields": int(frame.shape[1]),
            "id_field": meta["id"],
            "missing_rate": {k: float(v) for k, v in missing.items() if v > 0},
        }
    return out


def job_quality_frame(jobs: List[MaintenanceJob]) -> pd.DataFrame:
    """Canonical jobs as a DataFrame for aggregate quality analysis."""
    return pd.DataFrame(
        [
            {
                "job_id": j.job_id,
                "source_system": j.source_system,
                "department": j.department,
                "corridor_id": j.corridor_id,
                "data_quality_status": j.data_quality_status
                if isinstance(j.data_quality_status, str)
                else j.data_quality_status.value,
                "overdue": j.overdue,
                "duration_minutes": j.duration_minutes,
                "power_isolation_required": j.power_isolation_required,
                "line_configuration": j.line_configuration,
            }
            for j in jobs
        ]
    )


def quality_breakdown(jobs: List[MaintenanceJob]) -> Dict[str, Any]:
    """Aggregates used by the ingestion report: counts per status and source."""
    frame = job_quality_frame(jobs)
    if frame.empty:
        return {"by_status": {}, "by_source": {}, "by_corridor": {}, "overdue": 0}
    by_status = frame["data_quality_status"].value_counts().to_dict()
    by_source = frame.groupby("source_system")["data_quality_status"].value_counts()
    return {
        "by_status": {k: int(v) for k, v in by_status.items()},
        "by_source": {
            str(src): {str(status): int(n) for status, n in counts.items()}
            for src, counts in by_source.groupby(level=0)
        },
        "by_corridor": {
            str(k): int(v) for k, v in frame["corridor_id"].value_counts().items()
        },
        "overdue": int(frame["overdue"].sum()),
    }
