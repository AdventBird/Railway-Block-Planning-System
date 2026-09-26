"""Rules package — deterministic validation, compatibility & reason-code engines."""

from backend.app.rules.data_quality import DataQualityEngine, DataQualityReport
from backend.app.rules.blocks import BlockRuleEngine
from backend.app.rules.line_config import LineConfigEngine
from backend.app.rules.related import RelatedWorkEngine, Relationship, WorkRelationship
from backend.app.rules.compatibility import (
    Compatibility,
    CompatibilityEngine,
    CompatibilityVerdict,
    Execution,
)
from backend.app.rules.possession import PossessionCalculator, PossessionEstimate
from backend.app.rules.reasons import ReasonCode, ReasonCodeEngine, UnscheduledResult

__all__ = [
    "DataQualityEngine",
    "DataQualityReport",
    "BlockRuleEngine",
    "LineConfigEngine",
    "RelatedWorkEngine",
    "Relationship",
    "WorkRelationship",
    "Compatibility",
    "CompatibilityEngine",
    "CompatibilityVerdict",
    "Execution",
    "PossessionCalculator",
    "PossessionEstimate",
    "ReasonCode",
    "ReasonCodeEngine",
    "UnscheduledResult",
]
