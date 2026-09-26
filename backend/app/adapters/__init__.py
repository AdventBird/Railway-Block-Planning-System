"""Adapters — normalise source-specific records into canonical models.

Each adapter owns the mapping from one operational system's vocabulary
(TMS, SMMS, TDMS, COA/BDMS, timetable) to the canonical schemas in
``backend.app.schemas``. Source field names differ deliberately; adapters are
the only place where those names appear.
"""

from backend.app.adapters.base import SourceAdapter, AdapterError
from backend.app.adapters.tms import TMSAdapter
from backend.app.adapters.smms import SMMSAdapter
from backend.app.adapters.tdms import TDMSAdapter
from backend.app.adapters.coa import COAAdapter
from backend.app.adapters.timetable import TimetableAdapter

__all__ = [
    "SourceAdapter",
    "AdapterError",
    "TMSAdapter",
    "SMMSAdapter",
    "TDMSAdapter",
    "COAAdapter",
    "TimetableAdapter",
]
