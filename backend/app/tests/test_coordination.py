"""Tests for the domain-engine features 4, 11, 12, 13 and 21.

The canonical prototype pairings are pinned here:

- J-02 + J-09  rail weld + lamp batch     -> COMPATIBLE / PARALLEL
- J-05 + J-07  OHE tension + axle counter -> CONDITIONAL / SEQUENTIAL
- J-04 + J-12  BCM + cable inspection     -> INCOMPATIBLE

Backend job ids map to prototype ids as:
  J-02 -> TMS-ENG-9001   J-09 -> SMMS-SIG-503   J-05 -> TDMS-OHE-772
  J-07 -> SMMS-SIG-502   J-04 -> TMS-ENG-9002   J-12 -> TMS-ENG-9006
"""

from __future__ import annotations

import pytest

from backend.app.rules.compatibility import (
    Compatibility,
    CompatibilityEngine,
    Execution,
)
from backend.app.rules.possession import PossessionCalculator, PossessionBasis
from backend.app.rules.reasons import (
    REASON_DESCRIPTIONS,
    ReasonCode,
    ReasonCodeEngine,
    reason_code_catalogue,
)
from backend.app.rules.related import Relationship, RelationshipSignal, RelatedWorkEngine
from backend.app.schemas import BlockType, MaintenanceJob

from backend.app.tests.conftest import make_job

# Prototype pairing ids in the seeded backend world.
WELD = "TMS-ENG-9001"        # J-02 rail fracture weld (C1)
LAMP = "SMMS-SIG-503"        # J-09 signal lamp batch (C1)
TENSION = "TDMS-OHE-772"     # J-05 OHE auto-tension (C3)
AXLE = "SMMS-SIG-502"        # J-07 axle counter renewal (C3)
BCM = "TMS-ENG-9002"         # J-04 ballast cleaning (C2)
CABLE = "TMS-ENG-9006"       # J-12 cable route inspection (C2)


@pytest.fixture(scope="module")
def job_index(world):
    return {j.job_id: j for j in world.jobs}


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    from backend.app.api.app import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Feature 11 — compatible / conditional / incompatible work
# ---------------------------------------------------------------------------


class TestCompatibilityEngine:
    def test_compatible_parallel_pair(self, job_index):
        """J-02 + J-09: weld + lamp batch share the protection in parallel."""
        verdict = CompatibilityEngine().check(job_index[WELD], job_index[LAMP])
        assert verdict.compatibility == Compatibility.COMPATIBLE
        assert verdict.execution == Execution.PARALLEL
        assert verdict.bundleable

    def test_conditional_sequential_pair(self, job_index):
        """J-05 + J-07: tension needs the feed isolated; axle testing needs
        it energised — conditional, strict sequence with handover."""
        verdict = CompatibilityEngine().check(job_index[TENSION], job_index[AXLE])
        assert verdict.compatibility == Compatibility.CONDITIONAL
        assert verdict.execution == Execution.SEQUENTIAL
        assert "ISOLATION_CERTIFICATION" in verdict.matched_rule_ids
        assert verdict.setup_handover_minutes > 0
        assert "POWER_ISOLATION" in verdict.required_isolation
        assert verdict.reason_codes  # ISOLATION_CONFLICT reported

    def test_incompatible_pair(self, job_index):
        """J-04 + J-12: BCM excavates over the cable ducts — no joint working."""
        verdict = CompatibilityEngine().check(job_index[BCM], job_index[CABLE])
        assert verdict.compatibility == Compatibility.INCOMPATIBLE
        assert not verdict.bundleable
        assert ReasonCode.INCOMPATIBLE_WORK.value in verdict.reason_codes

    def test_same_corridor_alone_is_never_compatible_evidence(self, job_index):
        """Two same-corridor jobs with colliding methods must NOT be
        compatible merely for sharing C2."""
        weld = job_index[WELD]
        bcm = job_index[BCM]
        verdict = CompatibilityEngine().check(weld, bcm)
        assert verdict.compatibility == Compatibility.INCOMPATIBLE
        assert "SAME_CORRIDOR" not in verdict.matched_rule_ids

    def test_verdict_to_dict_roundtrip(self, job_index):
        verdict = CompatibilityEngine().check(job_index[WELD], job_index[LAMP])
        data = verdict.to_dict()
        assert data["compatibility"] == "COMPATIBLE"
        assert data["execution"] == "PARALLEL"
        assert data["bundleable"] is True

    def test_rules_file_is_config(self):
        """Rules load from the JSON configuration, not embedded code."""
        rules = CompatibilityEngine().rules
        assert rules["version"]
        assert rules["incompatibility_rules"]
        assert rules["conditional_rules"]
        assert "sequential_handover_overhead" in rules["overheads"]


# ---------------------------------------------------------------------------
# Feature 13 — parallel / sequential possession arithmetic
# ---------------------------------------------------------------------------


class TestPossessionCalculator:
    def test_single_job_phases(self):
        job = make_job(
            duration_minutes=90, setup_duration_minutes=15, restore_duration_minutes=10
        )
        est = PossessionCalculator().single(job)
        assert est.total_possession_minutes == 115
        assert est.work_minutes == 90
        assert est.setup_minutes == 15
        assert est.restore_minutes == 10
        assert any("115" in line for line in est.explanation)

    def test_parallel_duration_uses_max(self):
        a = make_job(job_id="A", duration_minutes=90, setup_duration_minutes=15, restore_duration_minutes=10)
        b = make_job(job_id="B", duration_minutes=60, setup_duration_minutes=10, restore_duration_minutes=5)
        est = PossessionCalculator().merged([a, b], Execution.PARALLEL)
        # max(90,60) + max(15,10) + max(10,5) + 5 merge overhead
        assert est.work_minutes == 90
        assert est.setup_minutes == 15
        assert est.restore_minutes == 10
        assert est.overhead_minutes == 5
        assert est.total_possession_minutes == 120
        assert est.basis == PossessionBasis.PARALLEL

    def test_sequential_duration_sums_work(self):
        a = make_job(job_id="A", duration_minutes=90, setup_duration_minutes=15, restore_duration_minutes=10)
        b = make_job(job_id="B", duration_minutes=180, setup_duration_minutes=15, restore_duration_minutes=30)
        est = PossessionCalculator().merged([a, b], Execution.SEQUENTIAL)
        # 90+180 work + max setups 15 + max restores 30 + one 15 min handover
        assert est.work_minutes == 270
        assert est.overhead_minutes == 15
        assert est.total_possession_minutes == 330
        assert est.basis == PossessionBasis.SEQUENTIAL

    def test_parallel_never_assumes_work_equals_possession(self):
        """Feature 12 guarantee: setup/restore are separate phases."""
        a = make_job(job_id="A", duration_minutes=60, setup_duration_minutes=20, restore_duration_minutes=20)
        b = make_job(job_id="B", duration_minutes=60, setup_duration_minutes=20, restore_duration_minutes=20)
        est = PossessionCalculator().merged([a, b], Execution.PARALLEL)
        assert est.total_possession_minutes > est.work_minutes  # 105 > 60

    def test_sequential_multi_job_handover_count(self):
        a = make_job(job_id="A", duration_minutes=60, setup_duration_minutes=10)
        b = make_job(job_id="B", duration_minutes=60, setup_duration_minutes=10)
        c = make_job(job_id="C", duration_minutes=60, setup_duration_minutes=10)
        est = PossessionCalculator().merged([a, b, c], Execution.SEQUENTIAL)
        assert est.overhead_minutes == 30  # 2 handovers x 15 min
        assert est.work_minutes == 180

    def test_merged_from_incompatible_verdict_raises(self, job_index):
        est = PossessionCalculator()
        verdict = CompatibilityEngine().check(job_index[BCM], job_index[CABLE])
        with pytest.raises(ValueError):
            est.merged_from_verdict([job_index[BCM], job_index[CABLE]], verdict)

    def test_merged_from_conditional_verdict_is_sequential(self, job_index):
        verdict = CompatibilityEngine().check(job_index[TENSION], job_index[AXLE])
        est = PossessionCalculator().merged_from_verdict(
            [job_index[TENSION], job_index[AXLE]], verdict
        )
        assert est.basis == PossessionBasis.SEQUENTIAL
        assert est.explanation[0].startswith("Compatibility verdict")

    def test_explanation_derives_every_figure(self):
        a = make_job(job_id="A", duration_minutes=90, setup_duration_minutes=15, restore_duration_minutes=10)
        b = make_job(job_id="B", duration_minutes=60, setup_duration_minutes=10, restore_duration_minutes=5)
        est = PossessionCalculator().merged([a, b], Execution.PARALLEL)
        joined = " ".join(est.explanation)
        assert str(est.total_possession_minutes) in joined
        assert "max(" in joined


# ---------------------------------------------------------------------------
# Feature 4 — related / co-located work detection
# ---------------------------------------------------------------------------


class TestRelatedWorkEngine:
    def test_same_section_pair_is_colocated_or_bundleable(self, world, job_index):
        rel = RelatedWorkEngine().relate(job_index[TENSION], job_index[AXLE], world.sections)
        assert rel.relationship in (Relationship.RELATED, Relationship.COLOCATED, Relationship.POSSIBLY_BUNDLEABLE)
        assert RelationshipSignal.SAME_CORRIDOR in rel.signals

    def test_same_corridor_only_is_related_not_bundleable(self, job_index):
        """Same corridor NEVER implies compatibility — RelatedWorkEngine must
        not emit POSSIBLY_BUNDLEABLE for corridor-sharing alone."""
        # BCM (C2) and cable inspection (C2) share a corridor; the cable job is
        # line-side marking, the BCM is exclusive — bundling is not offered.
        rel = RelatedWorkEngine().relate(job_index[BCM], job_index[CABLE])
        assert rel.relationship != Relationship.POSSIBLY_BUNDLEABLE
        assert RelationshipSignal.SAME_CORRIDOR in rel.signals

    def test_different_corridors_no_relationship(self, world, job_index):
        rel = RelatedWorkEngine().relate(job_index[WELD], job_index[TENSION], world.sections)
        assert rel.relationship == Relationship.NO_RELATIONSHIP

    def test_bundleable_pair_reports_evidence(self, world, job_index):
        rel = RelatedWorkEngine().relate(job_index[WELD], job_index[LAMP], world.sections)
        data = rel.to_dict()
        assert data["relationship"] in ("RELATED", "COLOCATED", "POSSIBLY_BUNDLEABLE")
        # whatever the level, bundling is only true at POSSIBLY_BUNDLEABLE
        assert data["bundleable"] == (data["relationship"] == "POSSIBLY_BUNDLEABLE")

    def test_relate_all_upper_triangle(self, world):
        rels = RelatedWorkEngine().relate_all(world.jobs[:6], world.sections)
        assert len(rels) == (6 * 5) // 2


# ---------------------------------------------------------------------------
# Feature 21 — reason-code engine
# ---------------------------------------------------------------------------


class TestReasonCodeEngine:
    def setup_method(self):
        self.engine = ReasonCodeEngine()
        self.job = make_job(duration_minutes=90, setup_duration_minutes=15, restore_duration_minutes=10)

    def test_insufficient_window(self):
        result = self.engine.evaluate(self.job, window_minutes=60)  # needs 115
        assert ReasonCode.INSUFFICIENT_WINDOW in result.reason_codes
        assert not result.scheduled

    def test_sufficient_window_no_code(self):
        result = self.engine.evaluate(self.job, window_minutes=120)
        assert ReasonCode.INSUFFICIENT_WINDOW not in result.reason_codes

    def test_resource_conflict(self):
        result = self.engine.evaluate(self.job, unavailable_resources=["REMM-2 welding set"])
        assert ReasonCode.RESOURCE_CONFLICT in result.reason_codes

    def test_isolation_conflict(self):
        result = self.engine.evaluate(self.job, isolation_available=False)
        assert ReasonCode.ISOLATION_CONFLICT in result.reason_codes

    def test_protected_movement_conflict(self):
        result = self.engine.evaluate(self.job, protected_overlap=True, gap_minutes=0)
        assert ReasonCode.PROTECTED_MOVEMENT_CONFLICT in result.reason_codes

    def test_incompatible_work(self):
        result = self.engine.evaluate(self.job, incompatible_with=["TMS-ENG-9002"])
        assert ReasonCode.INCOMPATIBLE_WORK in result.reason_codes

    def test_multiple_simultaneous_reasons(self):
        """A deferral usually has several causes — all codes must accumulate."""
        result = self.engine.evaluate(
            self.job,
            window_minutes=45,                       # too short
            protected_overlap=True,                  # protected path in the way
            unavailable_resources=["BCM-03"],        # machine unavailable
            isolation_available=False,               # feed already isolated
        )
        assert set(result.reason_codes) >= {
            ReasonCode.INSUFFICIENT_WINDOW,
            ReasonCode.PROTECTED_MOVEMENT_CONFLICT,
            ReasonCode.RESOURCE_CONFLICT,
            ReasonCode.ISOLATION_CONFLICT,
        }
        assert len(result.explanation) == len(result.reason_codes)
        data = result.to_dict()
        assert data == {
            "job_id": "TEST-JOB",
            "scheduled": False,
            "reason_codes": [c.value for c in result.reason_codes],
            "explanation": result.explanation,
        }

    def test_result_matches_brief_structure(self):
        result = self.engine.evaluate(
            self.job,
            protected_overlap=True,
            unavailable_resources=["Tower wagon TW-925"],
        )
        data = result.to_dict()
        assert set(data) == {"job_id", "scheduled", "reason_codes", "explanation"}
        assert data["scheduled"] is False
        assert isinstance(data["reason_codes"], list)
        assert isinstance(data["explanation"], list)
        assert data["reason_codes"] == ["PROTECTED_MOVEMENT_CONFLICT", "RESOURCE_CONFLICT"]

    def test_reason_code_catalogue_is_complete(self):
        catalogue = reason_code_catalogue()
        codes = {entry["code"] for entry in catalogue}
        assert codes == {c.value for c in ReasonCode}
        assert all(entry["description"] for entry in catalogue)
        assert set(REASON_DESCRIPTIONS) == set(ReasonCode)

    def test_no_feasible_window(self):
        result = self.engine.evaluate(
            self.job, feasible_block_types=[], windows_in_corridor=3
        )
        assert ReasonCode.NO_FEASIBLE_WINDOW in result.reason_codes

    def test_block_capacity_and_section_restriction(self):
        result = self.engine.evaluate(
            self.job,
            remaining_block_minutes=0,
            section_status="caution",
        )
        assert ReasonCode.BLOCK_CAPACITY in result.reason_codes
        assert ReasonCode.SECTION_RESTRICTION in result.reason_codes


# ---------------------------------------------------------------------------
# API surface for the new engines
# ---------------------------------------------------------------------------


class TestCoordinationApi:
    def test_coordination_endpoint_compatible(self, client):
        res = client.get("/api/coordination", params={"job_a": WELD, "job_b": LAMP})
        body = res.json()
        assert body["payload"]["compatibility"]["compatibility"] == "COMPATIBLE"
        assert body["payload"]["compatibility"]["execution"] == "PARALLEL"
        assert body["payload"]["possession"]["total_possession_minutes"] == 120

    def test_coordination_endpoint_conditional(self, client):
        res = client.get("/api/coordination", params={"job_a": TENSION, "job_b": AXLE})
        body = res.json()
        assert body["payload"]["compatibility"]["compatibility"] == "CONDITIONAL"
        assert body["payload"]["possession"]["total_possession_minutes"] == 330

    def test_coordination_endpoint_incompatible(self, client):
        res = client.get("/api/coordination", params={"job_a": BCM, "job_b": CABLE})
        body = res.json()
        assert body["payload"]["compatibility"]["compatibility"] == "INCOMPATIBLE"
        assert body["payload"]["possession"] is None

    def test_related_endpoint(self, client):
        res = client.get("/api/jobs/TMS-ENG-9002/related")
        body = res.json()
        assert body["status"] == "READY"
        assert body["payload"]["job_id"] == "TMS-ENG-9002"
        for rel in body["payload"]["relationships"]:
            assert rel["relationship"] in (
                "RELATED", "COLOCATED", "POSSIBLY_BUNDLEABLE", "NO_RELATIONSHIP",
            )

    def test_job_possession_endpoint(self, client):
        res = client.get("/api/jobs/TMS-ENG-9001/possession")
        body = res.json()
        est = body["payload"]
        assert est["basis"] == "SINGLE"
        # 90 work + 15 setup + 10 restore
        assert est["total_possession_minutes"] == 115
        assert est["work_minutes"] == 90

    def test_reason_codes_endpoint(self, client):
        res = client.get("/api/reason-codes")
        body = res.json()
        codes = {entry["code"] for entry in body["payload"]["reason_codes"]}
        assert "PROTECTED_MOVEMENT_CONFLICT" in codes
        assert "INSUFFICIENT_WINDOW" in codes

    def test_unknown_job_is_error(self, client):
        res = client.get("/api/coordination", params={"job_a": "NOPE", "job_b": WELD})
        body = res.json()
        assert body["status"] == "ERROR"
        assert body["errors"][0]["code"] == "JOB_NOT_FOUND"


# ---------------------------------------------------------------------------
# Feature 12 — canonical phase fields surface through the API
# ---------------------------------------------------------------------------


class TestWorkPhases:
    def test_jobs_payload_exposes_phase_fields(self, client):
        res = client.get("/api/jobs")
        job = res.json()["payload"]["jobs"][0]
        assert "setup_duration_minutes" in job
        assert "duration_minutes" in job
        assert "restore_duration_minutes" in job
        assert "work_phases" in job

    def test_work_phases_helper(self):
        job = make_job(duration_minutes=60, setup_duration_minutes=10, restore_duration_minutes=5)
        from backend.app.rules.possession import work_phases_minutes

        assert work_phases_minutes(job) == {
            "setup": 10, "work": 60, "restore": 5, "total_possession": 75,
        }
