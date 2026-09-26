"""Adapter contract shared by every source-system adapter."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List

from backend.app.schemas import (
    BlockWindow,
    DataQualityStatus,
    MaintenanceJob,
    TrainMovement,
)


class AdapterError(ValueError):
    """Raised when a source record violates the adapter contract itself."""


class SourceAdapter(ABC):
    """Base class for one operational source system."""

    #: canonical source-system tag, e.g. "TMS"
    source_system: str = ""

    @abstractmethod
    def to_jobs(self, records: List[Dict[str, Any]]) -> List[MaintenanceJob]:
        """Normalise raw source records into canonical MaintenanceJobs."""

    @abstractmethod
    def to_blocks(self, records: List[Dict[str, Any]]) -> List[BlockWindow]:
        """Normalise raw source records into canonical BlockWindows."""

    @abstractmethod
    def to_trains(self, records: List[Dict[str, Any]]) -> List[TrainMovement]:
        """Normalise raw source records into canonical TrainMovements."""

    # -- helpers -------------------------------------------------------------

    @staticmethod
    def _finalize_quality(model: Any, messages: List[Any]) -> Any:
        """Finalise data_quality fields from collected message objects.

        Rules (adapter level):
          - any ERROR message     -> INVALID
          - any WARNING message   -> REVIEW_REQUIRED
          - only INFO or nothing  -> READY
        The DataQualityEngine pass re-validates every record later and is the
        authoritative final status (it can add findings the adapter cannot
        see, e.g. cross-reference checks against the network register).
        """
        if any(m.severity == "ERROR" for m in messages):
            model.data_quality_status = DataQualityStatus.INVALID
        elif any(m.severity == "WARNING" for m in messages):
            model.data_quality_status = DataQualityStatus.REVIEW_REQUIRED
        else:
            model.data_quality_status = DataQualityStatus.READY
        model.data_quality_messages = list(messages)
        return model
