"""Comprehensive Test Suite for the Two-Level Priority Engine.

Tests:
1. Tier Precedence (Tier 0 > 1 > 2 > 3 > 4 regardless of internal score).
2. Same-Tier Ordering (ordered by internal score deterministically).
3. Hidden Score Verification (score is computed and used internally, but hidden from public representation).
4. Deterministic Results (consecutive runs yield identical ordering).
5. Edge Cases (overdue = 0, missing optional fields, identical jobs, maximum & minimum severity, etc.).
6. Canonical Dataset Compatibility (tests standard TMS/SMMS/TDMS jobs J-01 to J-13).
7. Explanation Helper (verifies explainability without exposing numeric values).
"""

from typing import List
import pytest

from backend.app.services.priority import (
    MaintenanceJob,
    PriorityEngine,
    Tier,
    TIER_NAMES,
)


# ---------------------------------------------------------------------------
# 1. Tier Precedence Tests
# ---------------------------------------------------------------------------
def test_tier_precedence_strict():
    """Verify that Tier 0 > 1 > 2 > 3 > 4 regardless of internal score.

    Even if a Tier 4 job has maximum severity/score (e.g. score ~99) and a
    Tier 1 job has minimum internal score, Tier 1 MUST rank ahead of Tier 4.
    """
    job_t4_high_score = MaintenanceJob(
        id="J-T4-HIGH",
        title="Routine Track Inspection",
        tier=Tier.TIER_4,
        severity="HIGH",
        asset_criticality="CRITICAL",
        operational_impact="CRITICAL",
        deadline_pressure=100.0,
    )

    job_t3 = MaintenanceJob(
        id="J-T3",
        title="Scheduled Leveling",
        tier=Tier.TIER_3,
        severity="MEDIUM",
    )

    job_t2 = MaintenanceJob(
        id="J-T2",
        title="Approaching Deadline",
        tier=Tier.TIER_2,
        severity="LOW",
    )

    job_t1_low_score = MaintenanceJob(
        id="J-T1-LOW",
        title="Minor Safety Alert",
        tier=Tier.TIER_1,
        severity="LOW",
        asset_criticality="LOW",
        operational_impact="LOW",
    )

    job_t0 = MaintenanceJob(
        id="J-T0",
        title="Emergency Rail Break",
        tier=Tier.TIER_0,
        severity="EMERGENCY",
    )

    jobs = [job_t4_high_score, job_t1_low_score, job_t3, job_t0, job_t2]
    ranked = PriorityEngine.rank_jobs(jobs)

    ranked_ids = [j.id for j in ranked]
    ranked_tiers = [j.tier for j in ranked]

    # Precedence must strictly be Tier 0, 1, 2, 3, 4
    assert ranked_tiers == [Tier.TIER_0, Tier.TIER_1, Tier.TIER_2, Tier.TIER_3, Tier.TIER_4]
    assert ranked_ids[0] == "J-T0"
    assert ranked_ids[1] == "J-T1-LOW"
    assert ranked_ids[2] == "J-T2"
    assert ranked_ids[3] == "J-T3"
    assert ranked_ids[4] == "J-T4-HIGH"


def test_tier_precedence_tier4_score_99_vs_tier1_score_10():
    """Explicitly verify prompt requirement: Tier 4 score = 99 must never outrank Tier 1 score = 65."""
    job_tier1 = MaintenanceJob(
        id="J-01-T1",
        title="Safety fracture",
        tier=Tier.TIER_1,
        severity="LOW",
    )
    job_tier4 = MaintenanceJob(
        id="J-02-T4",
        title="Routine lubrication",
        tier=Tier.TIER_4,
        severity="EMERGENCY",
        asset_criticality="CRITICAL",
        operational_impact="CRITICAL",
        deadline_pressure=100.0,
    )

    score_t1 = PriorityEngine.calculate_internal_score(job_tier1)
    score_t4 = PriorityEngine.calculate_internal_score(job_tier4)
    assert score_t4 > score_t1  # Tier 4 score is indeed higher internally

    ranked = PriorityEngine.rank_jobs([job_tier4, job_tier1])
    assert ranked[0].id == "J-01-T1"  # Tier 1 wins precedence
    assert ranked[1].id == "J-02-T4"


# ---------------------------------------------------------------------------
# 2. Same-Tier Ordering Tests
# ---------------------------------------------------------------------------
def test_same_tier_ordering_by_internal_score():
    """Verify that multiple jobs within the same tier are ordered by internal score descending."""
    job_high = MaintenanceJob(
        id="J-T1-HIGH",
        title="USFD Detected Rail Fracture on Trunk",
        tier=Tier.TIER_1,
        severity="CRITICAL",
        asset_criticality="CRITICAL",
        operational_impact="HIGH",
        deadline_pressure=90.0,
    )

    job_medium = MaintenanceJob(
        id="J-T1-MED",
        title="Signal Point S&T Failure",
        tier=Tier.TIER_1,
        severity="HIGH",
        asset_criticality="MEDIUM",
        operational_impact="MEDIUM",
        deadline_pressure=50.0,
    )

    job_low = MaintenanceJob(
        id="J-T1-LOW",
        title="Minor Intermittent Sensor Glitch",
        tier=Tier.TIER_1,
        severity="LOW",
        asset_criticality="LOW",
        operational_impact="LOW",
        deadline_pressure=10.0,
    )

    score_high = PriorityEngine.calculate_internal_score(job_high)
    score_med = PriorityEngine.calculate_internal_score(job_medium)
    score_low = PriorityEngine.calculate_internal_score(job_low)

    assert score_high > score_med > score_low

    # Pass in scrambled order
    ranked = PriorityEngine.rank_jobs([job_low, job_high, job_medium])

    assert [j.id for j in ranked] == ["J-T1-HIGH", "J-T1-MED", "J-T1-LOW"]


def test_same_tier_deterministic_tie_breaker():
    """Jobs with identical tier and internal score must use deterministic ID ordering."""
    job_b = MaintenanceJob(id="J-T1-B", title="Identical Issue", tier=Tier.TIER_1, severity="HIGH")
    job_a = MaintenanceJob(id="J-T1-A", title="Identical Issue", tier=Tier.TIER_1, severity="HIGH")

    assert PriorityEngine.calculate_internal_score(job_a) == PriorityEngine.calculate_internal_score(job_b)

    ranked1 = PriorityEngine.rank_jobs([job_b, job_a])
    ranked2 = PriorityEngine.rank_jobs([job_a, job_b])

    assert [j.id for j in ranked1] == ["J-T1-A", "J-T1-B"]
    assert [j.id for j in ranked2] == ["J-T1-A", "J-T1-B"]


# ---------------------------------------------------------------------------
# 3. Hidden Score Verification
# ---------------------------------------------------------------------------
def test_hidden_score_not_exposed_in_output():
    """Verify internal score exists for computation but is not leaked in public dict/fields."""
    job = MaintenanceJob(
        id="J-01",
        title="OHE mast repair",
        severity="CRITICAL",
        tier=Tier.TIER_1,
    )

    # 1. Internal score can be computed by the backend service
    score = PriorityEngine.calculate_internal_score(job)
    assert isinstance(score, float)
    assert 0.0 <= score <= 100.0

    # 2. Ranking produces output where numeric score is NOT an exposed attribute
    ranked = PriorityEngine.rank_jobs([job])
    result_job = ranked[0]

    assert not hasattr(result_job, "score")
    assert not hasattr(result_job, "internal_score")
    assert not hasattr(result_job, "ai_score")

    # 3. Serialized dict does not contain any score keys
    d = result_job.to_dict() if isinstance(result_job, MaintenanceJob) else result_job
    assert "score" not in d
    assert "internal_score" not in d
    assert "internalScore" not in d
    assert "ai_score" not in d
    assert "aiScore" not in d
    # Tier is exposed as standard 0-4 integer
    assert d["tier"] == 1


# ---------------------------------------------------------------------------
# 4. Deterministic Results
# ---------------------------------------------------------------------------
def test_ranking_is_strictly_deterministic():
    """Verify that multiple consecutive runs with random input shuffles yield identical results."""
    jobs: List[MaintenanceJob] = [
        MaintenanceJob(id="J-01", title="Shattered Insulator", severity="EMERGENCY"),
        MaintenanceJob(id="J-02", title="Rail Fracture Weld", severity="CRITICAL"),
        MaintenanceJob(id="J-03", title="Panel Interlocking Failure", severity="CRITICAL"),
        MaintenanceJob(id="J-04", title="Ballast Deep Screening", overdue_age=2.0),
        MaintenanceJob(id="J-05", title="Auto Tension", overdue_age=3.0),
        MaintenanceJob(id="J-06", title="Bridge Bearing Inspection", severity="MEDIUM"),
        MaintenanceJob(id="J-07", title="Axle Counter Renewal", severity="MEDIUM"),
        MaintenanceJob(id="J-08", title="Track Tamping", severity="MEDIUM"),
        MaintenanceJob(id="J-09", title="Signal Lamp Replacement", severity="LOW"),
        MaintenanceJob(id="J-10", title="Mast Lubrication", severity="ROUTINE"),
    ]

    run1 = [j.id for j in PriorityEngine.rank_jobs(jobs)]
    run2 = [j.id for j in PriorityEngine.rank_jobs(jobs)]
    run3 = [j.id for j in PriorityEngine.rank_jobs(list(reversed(jobs)))]

    assert run1 == run2
    assert run1 == run3


# ---------------------------------------------------------------------------
# 5. Edge Cases Tests
# ---------------------------------------------------------------------------
def test_edge_case_overdue_zero():
    """Overdue age of 0 or None should not crash and should receive 0 overdue score."""
    job1 = MaintenanceJob(id="J-OD-0", title="Test Job", overdue_age=0.0)
    job2 = MaintenanceJob(id="J-OD-NONE", title="Test Job", overdue_age=None)

    score1 = PriorityEngine.calculate_internal_score(job1)
    score2 = PriorityEngine.calculate_internal_score(job2)

    assert isinstance(score1, float)
    assert isinstance(score2, float)
    assert PriorityEngine.assign_tier(job1) == Tier.TIER_4


def test_edge_case_missing_optional_fields():
    """Minimal job with only ID must not crash and receive Tier 4."""
    minimal_job = MaintenanceJob(id="J-MIN")
    tier = PriorityEngine.assign_tier(minimal_job)
    score = PriorityEngine.calculate_internal_score(minimal_job)
    ranked = PriorityEngine.rank_jobs([minimal_job])

    assert tier == Tier.TIER_4
    assert 0.0 <= score <= 100.0
    assert len(ranked) == 1
    assert ranked[0].id == "J-MIN"


def test_edge_case_dict_input():
    """PriorityEngine must smoothly accept standard python dicts (e.g. from JSON payloads)."""
    raw_dict = {
        "jobId": "J-DICT-1",
        "title": "Broken rail defect",
        "dept": "Engineering",
        "severity": "EMERGENCY",
        "minutes": 120,
    }

    tier = PriorityEngine.assign_tier(raw_dict)
    score = PriorityEngine.calculate_internal_score(raw_dict)
    ranked = PriorityEngine.rank_jobs([raw_dict])

    assert tier == Tier.TIER_0
    assert score > 50.0
    assert len(ranked) == 1
    assert ranked[0]["jobId"] == "J-DICT-1"
    assert ranked[0]["tier"] == Tier.TIER_0


def test_edge_case_extreme_severities():
    """Verify maximum and minimum severity bounds."""
    job_max = MaintenanceJob(id="J-MAX", title="Max severity", severity=999.0)
    job_min = MaintenanceJob(id="J-MIN", title="Min severity", severity=-50.0)

    score_max = PriorityEngine.calculate_internal_score(job_max)
    score_min = PriorityEngine.calculate_internal_score(job_min)

    assert score_max <= 100.0
    assert score_min >= 0.0


def test_normalize_function():
    """Verify the normalize helper handles normal, out-of-bounds, and inverted scales."""
    assert PriorityEngine.normalize(50.0, 0.0, 100.0) == 50.0
    assert PriorityEngine.normalize(150.0, 0.0, 100.0) == 100.0  # Clamped
    assert PriorityEngine.normalize(-10.0, 0.0, 100.0) == 0.0   # Clamped
    assert PriorityEngine.normalize(2.5, 0.0, 5.0) == 50.0
    assert PriorityEngine.normalize(5.0, 10.0, 5.0) == 0.0      # Inverted bounds handled safely


# ---------------------------------------------------------------------------
# 6. Canonical Synthetic Dataset Verification (J-01 to J-13)
# ---------------------------------------------------------------------------
def test_canonical_13_jobs_tier_assignment():
    """Verify that canonical synthetic jobs from TMS/SMMS/TDMS match the expected tiers."""
    canonical_jobs = [
        {"id": "J-01", "title": "OHE insulator replacement (shattered)", "deadline": "Before first traffic (05:45)", "expected": Tier.TIER_0},
        {"id": "J-02", "title": "Rail fracture weld repair", "deadline": "Within 48 h (by 16 Sep 04:00)", "expected": Tier.TIER_1},
        {"id": "J-03", "title": "Tundla panel interlocking failure recovery", "deadline": "Immediate", "expected": Tier.TIER_1},
        {"id": "J-04", "title": "Ballast cleaning (BCM) — deep screening", "deadline": "Overdue (due 12 Sep)", "expected": Tier.TIER_2},
        {"id": "J-05", "title": "OHE auto-tension adjustment", "deadline": "Overdue (due 10 Sep)", "expected": Tier.TIER_2},
        {"id": "J-06", "title": "Girder bridge bearing inspection", "deadline": "30 Sep", "expected": Tier.TIER_3},
        {"id": "J-07", "title": "Axle counter renewal (EERC)", "deadline": "22 Sep", "expected": Tier.TIER_3},
        {"id": "J-08", "title": "Track tamping (TCP) — post-grinding leveling", "deadline": "20 Sep", "expected": Tier.TIER_3},
        {"id": "J-09", "title": "Signal lamp replacement — batch", "deadline": "30 Sep", "expected": Tier.TIER_4},
        {"id": "J-10", "title": "OHE mast pivot lubrication", "deadline": "05 Oct", "expected": Tier.TIER_4},
        {"id": "J-11", "title": "Vegetation clearance — cuttings", "deadline": "30 Sep", "expected": Tier.TIER_4},
        {"id": "J-12", "title": "Cable route inspection & marking", "deadline": "08 Oct", "expected": Tier.TIER_4},
        {"id": "J-13", "title": "Motor trolley & packset patrol", "deadline": "19 Sep", "expected": Tier.TIER_4},
    ]

    for item in canonical_jobs:
        job = MaintenanceJob.from_dict(item)
        assigned_tier = PriorityEngine.assign_tier(job)
        assert assigned_tier == item["expected"], f"Failed for {item['id']}: expected Tier {item['expected']}, got Tier {assigned_tier}"


# ---------------------------------------------------------------------------
# 7. Explainability Tests
# ---------------------------------------------------------------------------
def test_explanation_helper_no_numeric_scores():
    """Verify that explanation() provides readable domain rationale without leaking numeric scores."""
    job = MaintenanceJob(
        id="J-02",
        title="Rail fracture weld repair",
        asset="UP rail KM 18/4",
        tier=Tier.TIER_1,
        tier_reason="USFD-detected fracture; 30 km/h caution imposed",
        severity="CRITICAL",
        asset_criticality="HIGH",
    )

    exp = PriorityEngine.explanation(job)

    assert "Tier 1 (Safety-critical)" in exp
    assert "USFD-detected fracture" in exp
    assert "Severity level: CRITICAL" in exp
    assert "Asset criticality: HIGH" in exp
    # Must NOT contain internal float scores or formulas
    assert "%" not in exp
    assert "score" not in exp.lower()
    assert "weight" not in exp.lower()
