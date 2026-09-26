"""TimetableAdapter — operating timetable feed.

Timetable vocabulary: ``train_id``, ``train_type``, ``corridor``,
``entry_time``, ``exit_time``, ``protected``.
"""

from __future__ import annotations

from typing import Any, Dict, List

from backend.app.adapters.base import AdapterError, SourceAdapter
from backend.app.adapters.parsing import parse_hhmm
from backend.app.schemas import (
    BlockWindow,
    MaintenanceJob,
    TrainMovement,
    ValidationMessage,
)

#: Timetable corridor codes -> canonical corridor ids.
TIMETABLE_CORRIDOR_MAP: Dict[str, str] = {
    "NDLS-GZB": "C1",
    "TDL-CNB": "C2",
    "PRYJ-DDU": "C3",
    "GZB-ALJN": "C4",
    "DDU-BSB": "C5",
    "CNB-LKO": "C6",
}


class TimetableAdapter(SourceAdapter):
    """Normalises timetable rows into canonical TrainMovements."""

    source_system = "TIMETABLE"

    def to_trains(self, records: List[Dict[str, Any]]) -> List[TrainMovement]:
        trains: List[TrainMovement] = []
        for record in records:
            train = self._to_train(record)
            if train is not None:
                trains.append(train)
        return trains

    def _to_train(self, record: Dict[str, Any]) -> TrainMovement | None:
        messages: List[ValidationMessage] = []

        train_id = str(record.get("train_id") or "").strip()
        if not train_id:
            raise AdapterError(f"Timetable row without train_id cannot be mapped: {record!r}")

        corridor_code = str(record.get("corridor") or "").strip()
        corridor_id = TIMETABLE_CORRIDOR_MAP.get(corridor_code, "")
        if not corridor_id:
            messages.append(
                ValidationMessage(
                    code="INVALID_CORRIDOR",
                    field="corridor_id",
                    severity="ERROR",
                    message=f"Timetable corridor '{corridor_code}' is not a recognised corridor code.",
                )
            )

        entry = parse_hhmm(record.get("entry_time"))
        exit = parse_hhmm(record.get("exit_time"))
        if entry is None:
            messages.append(
                ValidationMessage(
                    code="INVALID_TIME",
                    field="entry_time",
                    severity="ERROR",
                    message=f"Timetable entry_time '{record.get('entry_time')}' is not a valid HH:MM time.",
                )
            )
        if exit is None:
            messages.append(
                ValidationMessage(
                    code="INVALID_TIME",
                    field="exit_time",
                    severity="ERROR",
                    message=f"Timetable exit_time '{record.get('exit_time')}' is not a valid HH:MM time.",
                )
            )

        protected_raw = record.get("protected")
        protected = parse_iso_protected(protected_raw)

        train_type = str(record.get("train_type") or "passenger").strip().lower()
        if train_type not in ("passenger", "freight", "special"):
            messages.append(
                ValidationMessage(
                    code="INVALID_TRAIN_TYPE",
                    field="train_type",
                    severity="WARNING",
                    message=f"Timetable train_type '{record.get('train_type')}' is not canonical; defaulting to passenger.",
                )
            )
            train_type = "passenger"

        try:
            train = TrainMovement(
                train_id=train_id,
                train_number=str(record.get("train_number") or ""),
                train_type=train_type,  # type: ignore[arg-type]
                corridor_id=corridor_id or "UNKNOWN",
                protected=protected,
                entry_time=entry,
                exit_time=exit,
                note=str(record.get("note") or ""),
                data_quality_status="READY",
                data_quality_messages=[],
            )
        except Exception as exc:
            raise AdapterError(f"Timetable train {train_id} failed canonical validation: {exc}") from exc

        return self._finalize_quality(train, messages)

    # A timetable feed does not create maintenance jobs or blocks.
    def to_jobs(self, records: List[Dict[str, Any]]) -> List[MaintenanceJob]:
        return []

    def to_blocks(self, records: List[Dict[str, Any]]) -> List[BlockWindow]:
        return []


def parse_iso_protected(raw: Any) -> bool:
    """Tolerant 'protected' flag parsing (bool or yes/no strings)."""
    if isinstance(raw, bool):
        return raw
    return str(raw or "").strip().lower() in {"1", "y", "yes", "true", "protected"}
