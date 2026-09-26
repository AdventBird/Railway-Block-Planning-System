"""Configurable cross-department priority normalisation (Feature 5).

Departmental labels are NEVER compared directly: each source system's
vocabulary is mapped through a JSON configuration (``models/priority_mapping.json``)
into canonical attributes. Operators can retune the mapping without touching
adapter code.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

from backend.app import config
from backend.app.schemas import (
    LineConfiguration,
    WorkingLine,
)

#: Priority config file default location (overridable in load_priority_config).
DEFAULT_PRIORITY_CONFIG = config.PRIORITY_CONFIG_PATH


class PriorityUnmapped(ValueError):
    """A source priority/severity label has no canonical mapping.

    Raised by the normalisers so adapters flag the record REVIEW_REQUIRED
    with a PRIORITY_UNMAPPED finding. Unknown severity must NEVER silently
    become LOW / P4 / NORMAL / ROUTINE.
    """

    def __init__(self, field: str, raw: str, source_system: str) -> None:
        self.field = field
        self.raw = raw
        self.source_system = source_system
        super().__init__(
            f"{source_system} label '{raw or '<blank>'}' has no {field} mapping "
            f"(PRIORITY_UNMAPPED) — the record requires review."
        )


@lru_cache(maxsize=8)
def _load_cached(path: str, mtime_ns: int) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def load_priority_config(path: Path | None = None) -> Dict[str, Any]:
    """Load (and cache) the JSON priority mapping configuration.

    The cache key includes the file mtime so edits are picked up without a
    process restart while still avoiding repeated disk reads.
    """
    cfg_path = Path(path) if path else DEFAULT_PRIORITY_CONFIG
    try:
        return _load_cached(str(cfg_path), int(cfg_path.stat().st_mtime_ns))
    except FileNotFoundError as exc:
        raise FileNotFoundError(
            f"Priority mapping configuration not found at {cfg_path}"
        ) from exc


def normalise_department(raw: Any) -> str:
    """Map a departmental label to the canonical department vocabulary."""
    mapping = load_priority_config().get("departments", {})
    key = str(raw or "").strip().upper()
    if key in mapping:
        return mapping[key]
    return str(raw or "Engineering")


@dataclass
class NormalisedPriority:
    """Result of mapping one source label into the canonical vocabulary.

    ``value`` is the canonical label when ``mapped`` is True; when False the
    label is UNMAPPED and the record must be marked REVIEW_REQUIRED with a
    PRIORITY_UNMAPPED finding — never silently downgraded to a safe default.
    """

    value: str
    mapped: bool
    raw: str = ""


# Sentinel canonical values used when a label cannot be mapped. These are
# deliberately outside every Literal the schema accepts, so a silent pass
# through pydantic is impossible.
UNMAPPED = "PRIORITY_UNMAPPED"


def _map_label(raw: Any, table: Dict[str, str]) -> NormalisedPriority:
    """Deterministically map one raw label through ``table``.

    Missing/blank labels are MISSING (also unmapped); unknown labels are
    UNMAPPED. Neither path silently downgrades to NORMAL/ROUTINE.
    """
    key = str(raw or "").strip()
    if not key:
        return NormalisedPriority(value=UNMAPPED, mapped=False, raw=key)
    canonical = table.get(key)
    if canonical is None:
        return NormalisedPriority(value=UNMAPPED, mapped=False, raw=key)
    return NormalisedPriority(value=canonical, mapped=True, raw=key)


def normalise_safety_consequence(raw: Any, source_system: str) -> str:
    """TMS/SMMS/TDMS severity labels -> canonical safety_consequence.

    A stated-but-unknown label raises :class:`PriorityUnmapped` so the
    adapter can flag the record REVIEW_REQUIRED instead of silently writing
    ROUTINE. A blank (unstated) label also raises — severity is
    priority-critical and must be explicit.
    """
    result = _map_label(raw, load_priority_config()["safety_consequence"][source_system])
    if not result.mapped:
        raise PriorityUnmapped("safety_consequence", result.raw, source_system)
    return result.value


def normalise_asset_criticality(raw: Any, source_system: str) -> str:
    """Source asset-type labels -> canonical asset_criticality.

    Blank (unstated) labels fall back to DISCRETIONARY — this is a
    descriptive classification, not a priority signal. A stated-but-unknown
    label raises :class:`PriorityUnmapped`.
    """
    result = _map_label(raw, load_priority_config()["asset_criticality"][source_system])
    if result.mapped:
        return result.value
    if not result.raw:  # not stated — descriptive default, not a priority downgrade
        return "DISCRETIONARY"
    raise PriorityUnmapped("asset_criticality", result.raw, source_system)


def normalise_urgency(raw: Any, source_system: str) -> str:
    """Source urgency/priority labels -> canonical urgency.

    Priority-critical: unknown OR missing labels raise so the record is
    flagged REVIEW_REQUIRED with PRIORITY_UNMAPPED — never silently LOW/P4.
    """
    result = _map_label(raw, load_priority_config()["urgency"][source_system])
    if not result.mapped:
        raise PriorityUnmapped("urgency", result.raw, source_system)
    return result.value


def normalise_operational_impact(raw: Any, source_system: str) -> str:
    """Source scope labels -> canonical operational_impact.

    Blank (unstated) scope falls back to LOCAL (descriptive, not a priority
    signal); unknown stated labels raise.
    """
    result = _map_label(raw, load_priority_config()["operational_impact"][source_system])
    if result.mapped:
        return result.value
    if not result.raw:
        return "LOCAL"
    raise PriorityUnmapped("operational_impact", result.raw, source_system)


def normalise_line_configuration(raw: Any) -> LineConfiguration:
    """Free-text section description -> canonical LineConfiguration."""
    text = str(raw or "").strip().upper()
    if "DOUBLE" in text:
        return LineConfiguration.DOUBLE
    if "SINGLE" in text:
        return LineConfiguration.SINGLE
    # Section names like "Tundla-Kanpur UP Line" imply double line; explicit
    # "single" only when stated.
    return LineConfiguration.DOUBLE if text else LineConfiguration.SINGLE


def normalise_working_line(raw: Any, line_configuration: LineConfiguration) -> WorkingLine:
    """Direction labels -> canonical WorkingLine, respecting section layout."""
    text = str(raw or "").strip().upper()
    if line_configuration == LineConfiguration.SINGLE:
        return WorkingLine.SINGLE
    if text in ("UP", "U"):
        return WorkingLine.UP
    if text in ("DOWN", "DN", "D"):
        return WorkingLine.DOWN
    return WorkingLine.SINGLE


def parse_bool(raw: Any) -> bool:
    """Tolerant boolean parsing across source vocabularies."""
    if isinstance(raw, bool):
        return raw
    return str(raw or "").strip().lower() in {"1", "y", "yes", "true", "required"}
