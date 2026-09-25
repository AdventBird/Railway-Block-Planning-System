"""Comprehensive Tests for Conflict Diagnosis Engine.

Verifies:
- Scenario 1: Infeasible Case (structured blocking constraints, reason codes, affected jobs)
- Scenario 2: Multiple Simultaneous Conflicts (train, resource, and block capacity simultaneously detected)
- Scenario 3: Single Conflict (only one specific reason code generated)
- Scenario 4: Locked Assignment (produces LOCKED_ASSIGNMENT when fixed work prevents scheduling)
- Scenario 5: Deterministic Diagnostics (repeated runs yield identical outputs)
- Backward compatibility with Phase 3 tests
"""

import pytest

from backend.app.services.diagnostics import (
    DiagnosticsEngine,
    JobDiagnostic,
    REASON_BLOCK_CAPACITY,
    REASON_INCOMPATIBLE_WORK,
    REASON_INSUFFICIENT_WINDOW,
    REASON_ISOLATION_CONFLICT,
    REASON_LOCKED_ASSIGNMENT,
    REASON_LOWER_PRIORITY,
    REASON_NO_FEASIBLE_WINDOW,
    REASON_RESOURCE_CONFLICT,
    REASON_TRAIN_CONFLICT,
)
from backend.app.services.planner import Planner
from backend.app.services.priority import MaintenanceJob, Tier


# ---------------------------------------------------------------------------
# Scenario 1: Infeasible Case
# ---------------------------------------------------------------------------
def test_scenario_1_infeasible_case():
    """Scenario 1: Infeasible case returns structured blocking constraints and reason codes without crash."""
    jobs = [
        MaintenanceJob(id="J-LOCKED-DEAD", corridor_id="C1", duration_minutes=60),
    ]
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 180},
    ]
    # Locked to a window that does not exist in tonight's plan
    locked = {"J-LOCKED-DEAD": "NON_EXISTENT_W99"}

    planner = Planner(plan_version="r2")
    result = planner.solve(jobs=jobs, windows=windows, locked_assignments=locked).to_dict()

    assert result["status"] == "INFEASIBLE"
    assert result["plan_version"] == "r2"
    assert "blocking_constraints" in result
    assert len(result["blocking_constraints"]) > 0
    assert "reason_codes" in result
    assert REASON_LOCKED_ASSIGNMENT in result["reason_codes"]
    assert "affected_jobs" in result
    assert "J-LOCKED-DEAD" in result["affected_jobs"]
    assert result["metrics"]["scheduled"] == 0
    assert result["metrics"]["deferred"] == 1


# ---------------------------------------------------------------------------
# Scenario 2: Multiple Simultaneous Conflicts
# ---------------------------------------------------------------------------
def test_scenario_2_multiple_simultaneous_conflicts():
    """Scenario 2: One job blocked by train, resource, and capacity; ALL three must appear together."""
    job = MaintenanceJob(
        id="J-17",
        corridor_id="C1",
        duration_minutes=180,  # Needs 180 + 30 buffer = 210 min
        resources=["Tower wagon TW-925"],
    )

    # Window W1 is only 120 min (capacity conflict)
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 120, "start": "01:00", "end": "03:00"},
    ]

    # Train movement occupies 01:30–02:30 (train conflict)
    train_movements = [
        {
            "id": "T-12301",
            "name": "Rajdhani 12301",
            "corridorId": "C1",
            "start": "01:30",
            "end": "02:30",
            "isProtected": True,
        }
    ]

    # Another job already reserved Tower wagon TW-925 (resource conflict)
    scheduled_assignments = [
        {
            "jobId": "J-05",
            "windowId": "W1",
            "resources": ["Tower wagon TW-925"],
        }
    ]

    diag = DiagnosticsEngine.diagnose_job(
        job=job,
        candidate_windows=windows,
        scheduled_assignments=scheduled_assignments,
        train_movements=train_movements,
    )

    codes = diag.reason_codes
    # All 3 reasons must appear
    assert REASON_TRAIN_CONFLICT in codes
    assert REASON_RESOURCE_CONFLICT in codes
    assert REASON_BLOCK_CAPACITY in codes or REASON_INSUFFICIENT_WINDOW in codes

    # Detailed blocking constraints must be listed
    constraints = diag.blocking_constraints
    assert len(constraints) >= 3

    has_train_text = any("Rajdhani 12301" in c or "Protected" in c for c in constraints)
    has_res_text = any("Tower wagon TW-925" in c or "J-05" in c for c in constraints)
    has_cap_text = any("shorter than" in c or "exceeds" in c or "window" in c for c in constraints)

    assert has_train_text is True
    assert has_res_text is True
    assert has_cap_text is True


# ---------------------------------------------------------------------------
# Scenario 3: Single Conflict
# ---------------------------------------------------------------------------
def test_scenario_3_single_conflict():
    """Scenario 3: Only the specific blocking constraint appears without unnecessary codes."""
    # Job fits comfortably, no resource needed, no trains, but requires power isolation on live window
    job = MaintenanceJob(
        id="J-OHE-ONLY",
        corridor_id="C1",
        duration_minutes=60,
        needs_power_isolation=True,
    )
    windows = [
        {"id": "W1", "corridorId": "C1", "minutes": 240, "allowsPowerIsolation": False},
    ]

    diag = DiagnosticsEngine.diagnose_job(
        job=job,
        candidate_windows=windows,
        scheduled_assignments=[],
        train_movements=[],
    )

    assert diag.reason_codes == [REASON_ISOLATION_CONFLICT]
    assert len(diag.blocking_constraints) == 1
    assert "power isolation" in diag.blocking_constraints[0]


# ---------------------------------------------------------------------------
# Scenario 4: Locked Assignment
# ---------------------------------------------------------------------------
def test_scenario_4_locked_assignment():
    """Scenario 4: Locked work produces LOCKED_ASSIGNMENT when locked target is invalid."""
    job = MaintenanceJob(id="J-LOCKED", corridor_id="C1", duration_minutes=60)
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 180}]
    locked = {"J-LOCKED": "W-INVALID"}

    diag = DiagnosticsEngine.diagnose_job(
        job=job,
        candidate_windows=windows,
        locked_assignments=locked,
    )

    assert REASON_LOCKED_ASSIGNMENT in diag.reason_codes
    assert any("locked to window 'W-INVALID'" in c for c in diag.blocking_constraints)


# ---------------------------------------------------------------------------
# Scenario 5: Deterministic Diagnostics
# ---------------------------------------------------------------------------
def test_scenario_5_deterministic_diagnostics():
    """Scenario 5: Consecutive diagnostic evaluations produce 100% identical outputs."""
    job = MaintenanceJob(
        id="J-DET",
        corridor_id="C1",
        duration_minutes=200,
        needs_power_isolation=True,
        resources=["REMM access crane"],
    )
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 120, "allowsPowerIsolation": False}]
    scheduled = [{"jobId": "J-OTHER", "windowId": "W1", "resources": ["REMM access crane"]}]

    diag1 = DiagnosticsEngine.diagnose_job(job, windows, scheduled).to_dict()
    diag2 = DiagnosticsEngine.diagnose_job(job, windows, scheduled).to_dict()

    assert diag1 == diag2


# ---------------------------------------------------------------------------
# Backward Compatibility Tests (Phase 3 suites)
# ---------------------------------------------------------------------------
def test_diagnose_no_feasible_window():
    """Job on corridor with no windows produces NO_FEASIBLE_WINDOW."""
    job = MaintenanceJob(id="J-ORPHAN", corridor_id="C99", duration_minutes=60)
    windows = [{"id": "W1", "corridorId": "C1", "minutes": 180}]

    diag = DiagnosticsEngine.diagnose_job(job, windows)
    assert REASON_NO_FEASIBLE_WINDOW in diag.reason_codes
    assert "No available maintenance windows" in diag.explanation


def test_diagnose_incompatible_work():
    """Incompatible jobs scheduled together report INCOMPATIBLE_WORK."""
    job = MaintenanceJob(id="J-CABLE", corridor_id="C2", duration_minutes=60)
    windows = [{"id": "W2", "corridorId": "C2", "minutes": 240}]
    scheduled = [{"jobId": "J-BCM", "windowId": "W2"}]
    compat_groups = [
        {"id": "CG-3", "status": "Incompatible", "jobIds": ["J-BCM", "J-CABLE"], "title": "BCM + Cable"}
    ]

    diag = DiagnosticsEngine.diagnose_job(
        job=job,
        candidate_windows=windows,
        scheduled_assignments=scheduled,
        compat_groups=compat_groups,
    )

    assert REASON_INCOMPATIBLE_WORK in diag.reason_codes
    assert any("Incompatible work methods" in c for c in diag.blocking_constraints)
