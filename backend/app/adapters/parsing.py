"""Shared parsing helpers for adapters (times, datetimes, quality messages)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional

from backend.app import config
from backend.app.schemas import ValidationMessage

#: Fixed operational clock for the synthetic planning night (deterministic:
#: driven by RBPS_SIMULATION_NOW so demo scenarios and tests stay stable).
NOW: datetime = config.simulation_now()


def parse_iso(value: Any) -> Optional[datetime]:
    """Parse an ISO-8601 string; returns None when absent/unparseable."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    try:
        dt = datetime.fromisoformat(str(value))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=NOW.tzinfo)
        return dt
    except (ValueError, TypeError):
        return None


def parse_hhmm(value: Any, base: Optional[datetime] = None) -> Optional[datetime]:
    """Parse 'HH:MM' onto the operational date (times may pass midnight)."""
    text = str(value or "").strip()
    if not text:
        return None
    try:
        hours, minutes = text.split(":")
        h, m = int(hours), int(minutes)
    except (ValueError, TypeError):
        return None
    if not (0 <= h <= 47 and 0 <= m < 60):
        return None
    base = base or NOW
    day_floor = base.replace(hour=0, minute=0, second=0, microsecond=0)
    return day_floor + timedelta(hours=h, minutes=m)


def unmapped_priority_message(field: str, exc: Exception) -> ValidationMessage:
    """PRIORITY_UNMAPPED finding — used when a source priority label has no
    canonical mapping. The record must never be silently downgraded."""
    return ValidationMessage(
        code="PRIORITY_UNMAPPED",
        field=field,
        severity="WARNING",
        message=str(exc),
    )


def stale_message(freshness: Optional[datetime], staleness_hours: int) -> Optional[ValidationMessage]:
    """Return a STALE finding when the record is too old to trust."""
    if freshness is None:
        return ValidationMessage(
            code="MISSING_FRESHNESS",
            field="freshness_timestamp",
            severity="WARNING",
            message="No freshness timestamp in the source record; age cannot be verified.",
        )
    age = NOW - freshness
    if age > timedelta(hours=staleness_hours):
        return ValidationMessage(
            code="STALE_RECORD",
            field="freshness_timestamp",
            severity="WARNING",
            message=(
                f"Record is {age.days} d {age.seconds // 3600} h old "
                f"(older than the {staleness_hours} h freshness limit) — confirm it is still open before planning."
            ),
        )
    return None
