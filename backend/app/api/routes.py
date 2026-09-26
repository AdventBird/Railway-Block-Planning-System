"""API routes — every response uses the single canonical envelope."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Query, Request

from backend.app.schemas import ApiEnvelope
from backend.app.services.domain import DomainService

router = APIRouter()


def get_domain(request: Request) -> DomainService:
    return request.app.state.domain


@router.get("/health", response_model=ApiEnvelope)
def health(request: Request) -> ApiEnvelope:
    return get_domain(request).health()


@router.get("/jobs", response_model=ApiEnvelope)
def jobs(
    request: Request,
    corridor_id: Optional[str] = Query(default=None),
    data_quality: Optional[str] = Query(default=None),
    source_system: Optional[str] = Query(default=None),
) -> ApiEnvelope:
    return get_domain(request).jobs(
        corridor_id=corridor_id,
        data_quality=data_quality,
        source_system=source_system,
    )


@router.get("/trains", response_model=ApiEnvelope)
def trains(
    request: Request,
    corridor_id: Optional[str] = Query(default=None),
    protected: Optional[bool] = Query(default=None),
) -> ApiEnvelope:
    return get_domain(request).trains(corridor_id=corridor_id, protected=protected)


@router.get("/blocks", response_model=ApiEnvelope)
def blocks(
    request: Request,
    corridor_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> ApiEnvelope:
    return get_domain(request).blocks(corridor_id=corridor_id, status=status)


@router.get("/network", response_model=ApiEnvelope)
def network(request: Request) -> ApiEnvelope:
    return get_domain(request).network()


@router.post("/ingest", response_model=ApiEnvelope)
def ingest(request: Request, force: bool = Query(default=False)) -> ApiEnvelope:
    return get_domain(request).ingest(force=force)


@router.get("/ingest/profile", response_model=ApiEnvelope)
def ingest_profile(request: Request) -> ApiEnvelope:
    """Pandas profiling of the raw source datasets (row counts, null rates)."""
    return get_domain(request).source_profiles()


@router.post("/validate", response_model=ApiEnvelope)
def validate(
    request: Request,
    job_ids: Optional[List[str]] = Query(default=None),
    include_messages: bool = Query(default=True),
) -> ApiEnvelope:
    return get_domain(request).validate(job_ids=job_ids, include_messages=include_messages)


@router.get("/jobs/{job_id}/block-compatibility", response_model=ApiEnvelope)
def block_compatibility(job_id: str, block_type: str, request: Request) -> ApiEnvelope:
    return get_domain(request).check_block_compatibility(job_id=job_id, block_type=block_type)


@router.get("/jobs/{job_id}/related", response_model=ApiEnvelope)
def related_work(job_id: str, request: Request) -> ApiEnvelope:
    """Feature 4 — jobs that may be coordinated with this one."""
    return get_domain(request).related_work(job_id=job_id)


@router.get("/jobs/{job_id}/possession", response_model=ApiEnvelope)
def job_possession(job_id: str, request: Request) -> ApiEnvelope:
    """Feature 12 — setup/work/restore possession split for one job."""
    return get_domain(request).job_possession(job_id=job_id)


@router.get("/coordination", response_model=ApiEnvelope)
def coordination(
    request: Request,
    job_a: str = Query(alias="job_a"),
    job_b: str = Query(alias="job_b"),
) -> ApiEnvelope:
    """Features 11 & 13 — pairwise compatibility verdict + merged possession."""
    return get_domain(request).coordination(job_a_id=job_a, job_b_id=job_b)


@router.get("/reason-codes", response_model=ApiEnvelope)
def reason_codes(request: Request) -> ApiEnvelope:
    """Feature 21 — authoritative machine-generated reason-code catalogue."""
    return get_domain(request).reason_codes()
