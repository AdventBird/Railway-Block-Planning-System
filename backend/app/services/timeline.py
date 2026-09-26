"""Continuous-timeline time arithmetic (Feature 15 — cross-midnight safe).

The planning horizon is explicitly overnight (e.g. 22:00 → 08:00). Raw
"HH:MM" string comparisons are forbidden: every subsystem converts to
continuous minutes on the operational timeline first.

    Day 0 23:30 → minute 1410
    Day 1 03:00 → minute 1620   (i.e. 1410 + 150 — crossing midnight)

The horizon anchor is configurable (HORIZON_START_MINUTES, default 22:00);
times earlier than the anchor are treated as next-day (Day 1). All overlap,
gap and interval-union helpers in this module operate on that timeline, so
every test of "does the job fit before the protected movement" behaves
identically for 23:30→01:00 as for 10:00→11:30.
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

#: Default overnight horizon anchor: 22:00 (minute 1320).
HORIZON_START_MINUTES: int = 1320

#: Length of one operational day in minutes.
DAY_MINUTES: int = 1440

_HHMM = re.compile(r"^(\d{1,2}):(\d{2})$")


def parse_hhmm_to_day_minutes(value: Any) -> Optional[int]:
    """'HH:MM' → minutes from midnight (0..1439). Returns None when invalid."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        minutes = int(value)
        return minutes % DAY_MINUTES if 0 <= minutes < DAY_MINUTES else None
    text = str(value).strip()
    match = _HHMM.match(text)
    if not match:
        return None
    hours, minutes = int(match.group(1)), int(match.group(2))
    if hours > 23 or minutes > 59:
        return None
    return hours * 60 + minutes


def minutes_from_hhmm(value: Any, horizon_start: int = HORIZON_START_MINUTES) -> Optional[int]:
    """'HH:MM' → continuous timeline minute.

    Times at/after the horizon anchor (default 22:00) are Day 0; earlier
    times are Day 1 (the following morning). Non-negative integer inputs are
    accepted verbatim so planners can pass already-converted minutes.
    """
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return int(value) if value >= 0 else None
    day_minutes = parse_hhmm_to_day_minutes(value)
    if day_minutes is None:
        return None
    if day_minutes < horizon_start:
        return day_minutes + DAY_MINUTES
    return day_minutes


def interval_minutes(start: Any, end: Any, horizon_start: int = HORIZON_START_MINUTES) -> Optional[Tuple[int, int]]:
    """('01:00', '04:00') → (1500, 1680) on the overnight timeline.

    Returns None when either bound is malformed. A zero-length interval is
    kept as (start, start) — callers treat it as empty.
    """
    s = minutes_from_hhmm(start, horizon_start)
    e = minutes_from_hhmm(end, horizon_start)
    if s is None or e is None:
        return None
    if e <= s:  # crossed midnight, e.g. 23:30 → 03:00
        e += DAY_MINUTES
    return s, e


def overlaps(start_a: int, end_a: int, start_b: int, end_b: int) -> bool:
    """[a_start, a_end) overlaps [b_start, b_end) on a continuous timeline."""
    return start_a < end_b and start_b < end_a


def interval_gaps(
    window_start: int,
    window_end: int,
    occupied: Sequence[Tuple[int, int]],
) -> List[Tuple[int, int]]:
    """Free sub-intervals of [window_start, window_end) after removing ``occupied``.

    Used by train protection: the safe periods around a protected movement.
    Example: WINDOW 1500–1680, TRAIN 1560–1680 → gaps [(1500, 1560)].
    """
    clipped = sorted(
        (max(s, window_start), min(e, window_end))
        for s, e in occupied
        if s < window_end and e > window_start
    )
    gaps: List[Tuple[int, int]] = []
    cursor = window_start
    for s, e in clipped:
        if s > cursor:
            gaps.append((cursor, s))
        cursor = max(cursor, e)
    if cursor < window_end:
        gaps.append((cursor, window_end))
    return [(s, e) for s, e in gaps if e > s]


def union_minutes(intervals: Iterable[Tuple[int, int]]) -> int:
    """Interval-union length in minutes (overlaps counted once).

    J1 60 min + J2 60 min in parallel ⇒ 60, never 120 (Feature 30).
    """
    normalized: List[Tuple[int, int]] = []
    for s, e in intervals:
        if e > s:
            normalized.append((s, e))
    if not normalized:
        return 0
    normalized.sort()
    total = 0
    cur_s, cur_e = normalized[0]
    for s, e in normalized[1:]:
        if s <= cur_e:
            cur_e = max(cur_e, e)
        else:
            total += cur_e - cur_s
            cur_s, cur_e = s, e
    return total + (cur_e - cur_s)


def format_minute_of_day(minutes: int) -> str:
    """Continuous timeline minute → 'HH:MM' (mod 24 h) for display."""
    m = int(minutes) % DAY_MINUTES
    return f"{m // 60:02d}:{m % 60:02d}"


def train_protection_gaps(
    window: Dict[str, Any],
    train_movements: Sequence[Dict[str, Any]],
    corridor_id: str,
) -> Tuple[List[Tuple[int, int]], List[Dict[str, Any]]]:
    """Safe periods of ``window`` after removing protected movements on ``corridor_id``.

    Returns (gaps, overlapping_movements). Malformed movements are skipped.
    """
    w = interval_minutes(window.get("start"), window.get("end"))
    if w is None:
        return [], []
    w_start, w_end = w
    occupied: List[Tuple[int, int]] = []
    hits: List[Dict[str, Any]] = []
    for mv in train_movements:
        if str(mv.get("corridorId") or mv.get("corridor_id") or "") != corridor_id:
            continue
        if not mv.get("isProtected", mv.get("protected", True)):
            continue
        t = interval_minutes(mv.get("start") or mv.get("entry"), mv.get("end") or mv.get("exit"))
        if t is None:
            continue
        if overlaps(w_start, w_end, t[0], t[1]):
            occupied.append(t)
            hits.append(mv)
    return interval_gaps(w_start, w_end, occupied), hits
