"""Tests for Uncertainty Buffer Service.

Verifies:
- Protected duration calculation (estimated + uncertainty + safety)
- Zero buffer handling
- Large buffer handling
- Fits before protected movement (true case)
- Does not fit before protected movement (false case / overrun risk)
- Remaining safe time calculation
- Structured evaluate_job dictionary output
- Plain-language explanation helper
- Edge cases (zero duration, negative values, missing fields, dict vs MaintenanceJob)
"""

import pytest

from backend.app.services.buffer import BufferEngine
from backend.app.services.priority import MaintenanceJob


def test_protected_duration_basic_formula():
    """Verify formula: protected_duration = estimated + uncertainty + safety.

    Example from prompt:
    Estimated: 90 min
    Uncertainty: 20 min
    Safety: 15 min
    Result: 125 min
    """
    result = BufferEngine.protected_duration(
        estimated_duration=90,
        uncertainty_buffer=20,
        safety_buffer=15,
    )
    assert result == 125


def test_protected_duration_from_job_object():
    """Verify protected duration when calling with a MaintenanceJob or dictionary."""
    job = MaintenanceJob(
        id="J-05",
        duration_minutes=90,
    )
    # With explicit custom buffers
    res1 = BufferEngine.protected_duration(job, uncertainty_buffer=20, safety_buffer=15)
    assert res1 == 125

    # With default buffers (15 uncertainty + 15 safety)
    res_default = BufferEngine.protected_duration(job)
    assert res_default == 90 + 15 + 15  # 120 min


def test_zero_buffer():
    """Uncertainty and safety buffers set to 0 should equal estimated duration."""
    assert BufferEngine.protected_duration(90, uncertainty_buffer=0, safety_buffer=0) == 90
    assert BufferEngine.protected_duration(45, 0, 0) == 45


def test_large_buffer():
    """Large buffers (e.g. 60 min uncertainty + 45 min safety) calculate accurately."""
    assert BufferEngine.protected_duration(180, uncertainty_buffer=60, safety_buffer=45) == 285


def test_fits_before_protected_movement_true():
    """Verify job fitting safely within traffic gap."""
    # 125 protected minutes inside 180 min available gap
    assert BufferEngine.fits_before_protected_movement(available_minutes=180, protected_minutes=125) is True
    assert BufferEngine.remaining_safe_time(available_minutes=180, protected_minutes=125) == 55

    # Exact fit
    assert BufferEngine.fits_before_protected_movement(available_minutes=125, protected_minutes=125) is True
    assert BufferEngine.remaining_safe_time(available_minutes=125, protected_minutes=125) == 0


def test_fits_before_protected_movement_false():
    """Verify job exceeding traffic gap detects overrun risk."""
    # 125 protected minutes inside 100 min available gap
    assert BufferEngine.fits_before_protected_movement(available_minutes=100, protected_minutes=125) is False
    assert BufferEngine.remaining_safe_time(available_minutes=100, protected_minutes=125) == -25


def test_evaluate_job_output_structure():
    """Verify structured output matching prompt specification:
    {
      "job_id": "J-05",
      "estimated": 90,
      "uncertainty": 20,
      "safety": 15,
      "protected_duration": 125,
      "fits": true
    }
    """
    job = {
        "job_id": "J-05",
        "minutes": 90,
    }
    evaluation = BufferEngine.evaluate_job(
        job,
        available_minutes=150,
        uncertainty_buffer=20,
        safety_buffer=15,
    )

    assert evaluation["job_id"] == "J-05"
    assert evaluation["estimated"] == 90
    assert evaluation["uncertainty"] == 20
    assert evaluation["safety"] == 15
    assert evaluation["protected_duration"] == 125
    assert evaluation["fits"] is True


def test_evaluate_job_overrun():
    """Verify evaluation when job exceeds available window."""
    job = MaintenanceJob(id="J-HEAVY", duration_minutes=180)
    evaluation = BufferEngine.evaluate_job(
        job,
        available_minutes=120,
        uncertainty_buffer=30,
        safety_buffer=15,
    )

    assert evaluation["protected_duration"] == 225
    assert evaluation["fits"] is False


def test_edge_cases_buffers():
    """Verify robust handling of zero duration, negative duration/buffers, and missing attributes."""
    # Zero duration job
    assert BufferEngine.protected_duration(0, 10, 10) == 20

    # Negative duration/buffer clamped to 0
    assert BufferEngine.protected_duration(-20, -5, -10) == 0

    # Job with missing duration
    job_empty = {}
    eval_empty = BufferEngine.evaluate_job(job_empty, available_minutes=60)
    assert eval_empty["estimated"] == 0
    assert eval_empty["protected_duration"] >= 0
    assert eval_empty["fits"] is True


def test_explain_buffer():
    """Verify explain output contains breakdown and clearance metrics."""
    exp = BufferEngine.explain("J-05", available_minutes=150, estimated=90, uncertainty=20, safety=15)
    assert "Buffer Protection Analysis for Job J-05" in exp
    assert "Estimated Duration: 90 min" in exp
    assert "Uncertainty Buffer: +20 min" in exp
    assert "Safety Margin: +15 min" in exp
    assert "Total Protected Duration: 125 min" in exp
    assert "Available Window: 150 min [FITS]" in exp
    assert "Clearance Buffer: 25 min remaining" in exp
