"""Domain orchestrator — turns the canonical world state into API envelopes.

Every endpoint returns the single canonical response structure:
``{status, generated_at, payload, data_quality, errors}``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.app.rules.blocks import BlockRuleEngine
from backend.app.rules.compatibility import Compatibility, CompatibilityEngine, Execution
from backend.app.rules.data_quality import DataQualityReport
from backend.app.rules.line_config import LineConfigEngine
from backend.app.rules.possession import PossessionCalculator, work_phases_minutes
from backend.app.rules.reasons import reason_code_catalogue
from backend.app.rules.related import RelatedWorkEngine
from backend.app.schemas import (
    ApiEnvelope,
    BlockType,
    MaintenanceJob,
    ValidationMessage,
)
from backend.app.services.ingestion import IngestionResult
from backend.app.services.repository import WorldRepository


def _envelope_status(report: Optional[DataQualityReport]) -> str:
    """Overall status: worst case across all validated records."""
    if report is None:
        return "OK"
    counts = report.counts
    if counts.get("invalid", 0) > 0:
        return "INVALID"
    if counts.get("stale", 0) > 0:
        return "STALE"
    if counts.get("review_required", 0) > 0:
        return "REVIEW_REQUIRED"
    return "READY"


def quality_summary(report: Optional[DataQualityReport]) -> Optional[Dict[str, int]]:
    if report is None:
        return None
    return dict(report.counts)


class DomainService:
    """High-level domain API used by the FastAPI routers."""

    def __init__(self, repository: WorldRepository) -> None:
        self._repo = repository
        self._block_rules = BlockRuleEngine()
        self._line_rules = LineConfigEngine()
        self._related_rules = RelatedWorkEngine()
        self._compat_rules = CompatibilityEngine()
        self._possession = PossessionCalculator()

    # ------------------------------------------------------------------ reads

    def health(self) -> ApiEnvelope:
        world = self._repo.load()
        summary = quality_summary(world.report)
        status = _envelope_status(world.report) if world.report else "OK"
        payload = {
            "service": "railway-block-planning-domain",
            "repository_backend": type(self._repo).__name__,
            "sources_loaded": world.sources_loaded,
            "adapter_errors": world.adapter_errors,
            "job_count": len(world.jobs),
            "train_count": len(world.trains),
            "block_count": len(world.blocks),
            "resource_count": len(world.resources),
            "corridor_count": len(world.corridors),
            "section_count": len(world.sections),
        }
        return ApiEnvelope(status=status, payload=payload, data_quality=summary)  # type: ignore[arg-type]

    def jobs(
        self,
        corridor_id: Optional[str] = None,
        data_quality: Optional[str] = None,
        source_system: Optional[str] = None,
    ) -> ApiEnvelope:
        world = self._repo.load()
        jobs = world.jobs
        if corridor_id:
            jobs = [j for j in jobs if j.corridor_id == corridor_id]
        if data_quality:
            jobs = [j for j in jobs if j.data_quality_status == data_quality.upper()]
        if source_system:
            jobs = [j for j in jobs if j.source_system == source_system.upper()]

        payload: Dict[str, Any] = {
            "jobs": [_job_payload(j, world, self._block_rules, self._line_rules) for j in jobs],
            "count": len(jobs),
        }
        return ApiEnvelope(
            status=_envelope_status(world.report),
            payload=payload,
            data_quality=quality_summary(world.report),  # type: ignore[arg-type]
        )

    def trains(self, corridor_id: Optional[str] = None, protected: Optional[bool] = None) -> ApiEnvelope:
        world = self._repo.load()
        trains = world.trains
        if corridor_id:
            trains = [t for t in trains if t.corridor_id == corridor_id]
        if protected is not None:
            trains = [t for t in trains if t.protected == protected]
        payload = {
            "trains": [t.model_dump(mode="json") for t in trains],
            "count": len(trains),
        }
        return ApiEnvelope(
            status=_envelope_status(world.report),
            payload=payload,
            data_quality=quality_summary(world.report),  # type: ignore[arg-type]
        )

    def blocks(self, corridor_id: Optional[str] = None, status: Optional[str] = None) -> ApiEnvelope:
        world = self._repo.load()
        blocks = world.blocks
        if corridor_id:
            blocks = [b for b in blocks if b.corridor_id == corridor_id]
        if status:
            blocks = [b for b in blocks if b.status == status]
        payload = {
            "blocks": [b.model_dump(mode="json") for b in blocks],
            "count": len(blocks),
        }
        return ApiEnvelope(
            status=_envelope_status(world.report),
            payload=payload,
            data_quality=quality_summary(world.report),  # type: ignore[arg-type]
        )

    def network(self) -> ApiEnvelope:
        world = self._repo.load()
        payload = {
            "corridors": [c.model_dump(mode="json") for c in world.corridors],
            "sections": [s.model_dump(mode="json") for s in world.sections],
            "resources": [r.model_dump(mode="json") for r in world.resources],
        }
        return ApiEnvelope(
            status=_envelope_status(world.report),
            payload=payload,
            data_quality=quality_summary(world.report),  # type: ignore[arg-type]
        )

    def validate(
        self,
        job_ids: Optional[List[str]] = None,
        include_messages: bool = True,
    ) -> ApiEnvelope:
        """Re-run the deterministic validation pass and return the report."""
        world = self._repo.refresh()
        report = world.report
        assert report is not None  # refresh() always validates

        selected = set(job_ids or [])
        per_job: Dict[str, Any] = {}
        for job_id, status in report.jobs.items():
            if selected and job_id not in selected:
                continue
            entry: Dict[str, Any] = {"status": status.value}
            if include_messages:
                entry["messages"] = [
                    m.model_dump(mode="json") for m in report.messages.get(job_id, [])
                ]
            per_job[job_id] = entry

        return ApiEnvelope(
            status=_envelope_status(report),
            payload={"validation": per_job, "counts": dict(report.counts)},
            data_quality=dict(report.counts),
        )

    # ------------------------------------------------------------------ writes

    def ingest(self, force: bool = False) -> ApiEnvelope:
        """Re-run ingestion from the source datasets."""
        if force:
            world = self._repo.refresh()
        else:
            world = self._repo.load()
        return ApiEnvelope(
            status=_envelope_status(world.report),
            payload={
                "sources_loaded": world.sources_loaded,
                "adapter_errors": world.adapter_errors,
                "job_count": len(world.jobs),
                "train_count": len(world.trains),
                "block_count": len(world.blocks),
                "counts": dict(world.report.counts) if world.report else {},
            },
            data_quality=quality_summary(world.report),  # type: ignore[arg-type]
        )

    def source_profiles(self) -> ApiEnvelope:
        """Pandas profiling of the raw sources (pulled from the last pass)."""
        world = self._repo.load()
        return ApiEnvelope(
            status=_envelope_status(world.report),
            payload={
                "sources": world.source_profiles,
                "quality_breakdown": world.quality_breakdown,
            },
            data_quality=quality_summary(world.report),  # type: ignore[arg-type]
        )

    # ------------------------------------------------------------------ rules

    def check_block_compatibility(self, job_id: str, block_type: str) -> ApiEnvelope:
        world = self._repo.load()
        job = next((j for j in world.jobs if j.job_id == job_id), None)
        if job is None:
            return ApiEnvelope(
                status="ERROR",
                payload={},
                errors=[ValidationMessage(
                    code="JOB_NOT_FOUND",
                    severity="ERROR",
                    message=f"No job with id '{job_id}'.",
                )],
            )
        try:
            bt = BlockType(block_type.upper())
        except ValueError:
            return ApiEnvelope(
                status="ERROR",
                payload={},
                errors=[ValidationMessage(
                    code="INVALID_BLOCK_TYPE",
                    severity="ERROR",
                    message=f"'{block_type}' is outside the block taxonomy (TRAFFIC/POWER/POWER_AND_TRAFFIC).",
                )],
            )
        verdict = self._block_rules.check(job, bt)
        line_verdict = self._line_rules.check(job, _find_section(world, job))
        payload = {
            "job_id": job.job_id,
            "block_type": bt.value,
            "compatible": verdict.compatible,
            "reasons": [m.model_dump(mode="json") for m in verdict.reasons],
            "line_feasibility": {
                "feasible": line_verdict.feasible,
                "working_line": line_verdict.working_line,
                "adjacent_line": line_verdict.adjacent_line,
                "adjacent_movement_may_continue": line_verdict.adjacent_movement_may_continue,
                "both_directions_impacted": line_verdict.both_directions_impacted,
                "notes": [m.model_dump(mode="json") for m in line_verdict.reasons],
            },
            "feasible_block_types": [b.value for b in self._block_rules.feasible_block_types(job)],
        }
        return ApiEnvelope(
            status="READY" if verdict.compatible and line_verdict.feasible else "REVIEW_REQUIRED",
            payload=payload,
        )

    # ------------------------------------------------------------- coordination

    def related_work(self, job_id: str) -> ApiEnvelope:
        """Feature 4 — jobs that may be coordinated with ``job_id``.

        Relatedness is a signal, never a merge instruction.
        """
        world = self._repo.load()
        job = _get_job(world, job_id)
        if job is None:
            return _job_not_found(job_id)
        relationships = [
            rel.to_dict()
            for rel in self._related_rules.relate_all(world.jobs, world.sections)
            if job_id in (rel.job_a, rel.job_b) and rel.relationship.value != "NO_RELATIONSHIP"
        ]
        return ApiEnvelope(
            status="READY",
            payload={"job_id": job_id, "relationships": relationships},
        )

    def coordination(self, job_a_id: str, job_b_id: str) -> ApiEnvelope:
        """Feature 11 — pairwise compatibility verdict + Feature 13 possession.

        Returns the deterministic verdict, and when bundleable the merged
        possession arithmetic with its full derivation explanation.
        """
        world = self._repo.load()
        job_a = _get_job(world, job_a_id)
        if job_a is None:
            return _job_not_found(job_a_id)
        job_b = _get_job(world, job_b_id)
        if job_b is None:
            return _job_not_found(job_b_id)

        verdict = self._compat_rules.check(job_a, job_b)
        related = self._related_rules.relate(job_a, job_b, world.sections)
        payload: Dict[str, Any] = {
            "compatibility": verdict.to_dict(),
            "relationship": related.to_dict(),
        }
        if verdict.bundleable:
            execution = verdict.execution or Execution.SEQUENTIAL
            estimate = self._possession.merged([job_a, job_b], execution)
            payload["possession"] = estimate.to_dict()
        else:
            payload["possession"] = None
            payload["possession_note"] = (
                "No merged possession: jobs are incompatible — plan separately." if related.relationship.value != "NO_RELATIONSHIP"
                else "No merged possession: jobs are incompatible."
            )
        status = "READY" if verdict.compatibility == Compatibility.COMPATIBLE else "REVIEW_REQUIRED"
        return ApiEnvelope(status=status, payload=payload)

    def job_possession(self, job_id: str) -> ApiEnvelope:
        """Feature 12 — explicit setup/work/restore split for one job."""
        world = self._repo.load()
        job = _get_job(world, job_id)
        if job is None:
            return _job_not_found(job_id)
        estimate = self._possession.single(job)
        return ApiEnvelope(status="READY", payload=estimate.to_dict())

    def reason_codes(self) -> ApiEnvelope:
        """Feature 21 — the authoritative reason-code catalogue."""
        return ApiEnvelope(status="READY", payload={"reason_codes": reason_code_catalogue()})

    # ------------------------------------------------------------- planning

    def world_snapshot(self) -> Dict[str, Any]:
        """Canonical world in snapshot form (for plan-staleness comparison)."""
        world = self._repo.load()
        return {
            "jobs": [
                {
                    "job_id": j.job_id,
                    "severity": j.severity,
                    "tier": j.tier,
                    "deadline": j.deadline.isoformat() if j.deadline else None,
                    "status": j.status,
                    "required_resources": list(j.required_resources),
                    "power_isolation_required": j.power_isolation_required,
                }
                for j in world.jobs
            ]
        }

    def block_clearance(self, job_id: str, block_id: str) -> ApiEnvelope:
        """POST /api/block-clearance/check — rule-engine decision only.

        Checks block type, corridor, line configuration, isolation and
        protected train movement protection for a (job, block) pair.
        No business logic lives in the route layer.
        """
        from backend.app.services.timeline import train_protection_gaps

        world = self._repo.load()
        job = _get_job(world, job_id)
        if job is None:
            return _job_not_found(job_id)
        block = next((b for b in world.blocks if b.block_id == block_id or b.window_id == block_id), None)
        if block is None:
            return ApiEnvelope(
                status="ERROR",
                payload={},
                errors=[ValidationMessage(
                    code="BLOCK_NOT_FOUND",
                    severity="ERROR",
                    message=f"No block '{block_id}' in the canonical block register.",
                )],
            )

        issues: List[ValidationMessage] = []
        reason_codes: List[str] = []

        # Block type vs job requirement (rule engine is authoritative)
        verdict = self._block_rules.check(job, block.block_type)
        if not verdict.compatible:
            reason_codes.extend(r.code for r in verdict.reasons)
            issues.extend(verdict.reasons)

        # Corridor match
        if job.corridor_id != block.corridor_id:
            reason_codes.append("NO_FEASIBLE_WINDOW")
            issues.append(ValidationMessage(
                code="CORRIDOR_MISMATCH",
                field="corridor_id",
                severity="ERROR",
                message=f"Job corridor {job.corridor_id} does not match block corridor {block.corridor_id}.",
            ))

        # Line configuration feasibility
        line_verdict = self._line_rules.check(job, _find_section(world, job))
        if not line_verdict.feasible:
            reason_codes.append("SECTION_RESTRICTION")
            issues.extend(line_verdict.reasons)

        # Protected train movement protection on the block corridor
        if block.start is not None and block.end is not None:
            window = {
                "start": block.start.strftime("%H:%M"),
                "end": block.end.strftime("%H:%M"),
                "corridorId": block.corridor_id,
            }
            trains = [
                {
                    "corridorId": t.corridor_id,
                    "isProtected": t.protected,
                    "start": t.entry_time.strftime("%H:%M") if t.entry_time else None,
                    "end": t.exit_time.strftime("%H:%M") if t.exit_time else None,
                }
                for t in world.trains
            ]
            gaps, hits = train_protection_gaps(window, trains, block.corridor_id)
            required = (job.duration_minutes or 0) + job.setup_duration_minutes + job.restore_duration_minutes
            if gaps and hits and not any(e - s >= required for s, e in gaps):
                reason_codes.append("PROTECTED_MOVEMENT_CONFLICT")
                issues.append(ValidationMessage(
                    code="PROTECTED_MOVEMENT_CONFLICT",
                    severity="ERROR",
                    message=(
                        f"Protected movement(s) {[h.get('id') for h in hits]} leave no "
                        f"{required}-minute safe gap inside the block."
                    ),
                ))

        allowed = not issues
        payload = {
            "allowed": allowed,
            "job_id": job.job_id,
            "block_id": block.block_id,
            "issues": [m.model_dump(mode="json") for m in issues],
            "reason_codes": sorted(set(reason_codes)),
            "messages": [m.message for m in issues],
        }
        return ApiEnvelope(status="READY" if allowed else "REVIEW_REQUIRED", payload=payload)


def _get_job(world: IngestionResult, job_id: str) -> Optional[MaintenanceJob]:
    return next((j for j in world.jobs if j.job_id == job_id), None)


def _job_not_found(job_id: str) -> ApiEnvelope:
    return ApiEnvelope(
        status="ERROR",
        payload={},
        errors=[ValidationMessage(
            code="JOB_NOT_FOUND",
            severity="ERROR",
            message=f"No job with id '{job_id}'.",
        )],
    )


def _find_section(world: IngestionResult, job: MaintenanceJob):
    """Locate the canonical section for a job, when one is stated."""
    if not job.section_id:
        return None
    return next((s for s in world.sections if s.section_id == job.section_id), None)


def _job_payload(
    job: MaintenanceJob,
    world: IngestionResult,
    block_rules: BlockRuleEngine,
    line_rules: LineConfigEngine,
) -> Dict[str, Any]:
    """Canonical job projection, enriched with rule-engine decisions."""
    section = _find_section(world, job)
    line_verdict = line_rules.check(job, section)
    data = json_safe(job)
    data["feasible_block_types"] = [
        b.value for b in block_rules.feasible_block_types(job)
    ]
    data["line_feasibility"] = {
        "feasible": line_verdict.feasible,
        "working_line": line_verdict.working_line,
        "adjacent_line": line_verdict.adjacent_line,
        "adjacent_movement_may_continue": line_verdict.adjacent_movement_may_continue,
        "both_directions_impacted": line_verdict.both_directions_impacted,
        "notes": [m.model_dump(mode="json") for m in line_verdict.reasons],
    }
    return data


def json_safe(model) -> Dict[str, Any]:
    """model_dump with JSON-safe datetimes/enums."""
    return model.model_dump(mode="json")
