"""Executions API router."""

import asyncio
import inspect
import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import async_session, get_db
from app.models import Execution, Project
from app.schemas import DashboardStats, ExecutionCreate, ExecutionResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/executions", tags=["executions"])


@router.get("", response_model=list[ExecutionResponse])
@router.get("/", response_model=list[ExecutionResponse], include_in_schema=False)
async def list_executions(
    project_id: Optional[int] = Query(None, description="Filter by project ID"),
    status: Optional[str] = Query(None, description="Filter by execution status"),
    limit: int = Query(50, ge=1, le=500, description="Max number of executions to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: AsyncSession = Depends(get_db),
) -> list[Execution]:
    """List test executions with optional filters, ordered by creation date descending."""
    query = (
        select(Execution)
        .options(selectinload(Execution.project))
        .order_by(Execution.created_at.desc())
    )

    if project_id is not None:
        query = query.where(Execution.project_id == project_id)
    if status is not None:
        query = query.where(Execution.status == status)

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)) -> DashboardStats:
    """Return aggregated dashboard statistics for executions and projects."""
    total_executions = (
        await db.scalar(select(func.count(Execution.id)))
    ) or 0
    passed = (
        await db.scalar(
            select(func.count(Execution.id)).where(Execution.status == "passed")
        )
    ) or 0
    failed = (
        await db.scalar(
            select(func.count(Execution.id)).where(Execution.status == "failed")
        )
    ) or 0
    error = (
        await db.scalar(
            select(func.count(Execution.id)).where(Execution.status == "error")
        )
    ) or 0
    running = (
        await db.scalar(
            select(func.count(Execution.id)).where(Execution.status == "running")
        )
    ) or 0

    total_completed = passed + failed
    pass_rate = (
        round((passed / total_completed) * 100.0, 2)
        if total_completed > 0
        else 0.0
    )

    recent_query = (
        select(Execution)
        .options(selectinload(Execution.project))
        .order_by(Execution.created_at.desc())
        .limit(10)
    )
    recent_result = await db.execute(recent_query)
    recent_executions = list(recent_result.scalars().all())

    projects_count = (
        await db.scalar(
            select(func.count(Project.id)).where(Project.is_active.is_(True))
        )
    ) or 0

    return DashboardStats(
        total_executions=total_executions,
        passed=passed,
        failed=failed,
        error=error,
        running=running,
        pass_rate=pass_rate,
        recent_executions=recent_executions,
        projects_count=projects_count,
    )


@router.post(
    "",
    response_model=ExecutionResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/",
    response_model=ExecutionResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def create_execution(
    execution_in: ExecutionCreate,
    db: AsyncSession = Depends(get_db),
) -> Execution:
    """Create and start a new test execution in the background."""
    # 1. Validate project exists
    project = await db.get(Project, execution_in.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id {execution_in.project_id} not found",
        )

    # 2. Prepare Execution record with data from ExecutionCreate
    data = execution_in.model_dump()

    # 3. Copy test_type from project (and browser default if not set)
    data["test_type"] = project.test_type
    if not data.get("browser"):
        data["browser"] = project.browser

    execution = Execution(**data, status="pending")
    db.add(execution)

    # 4. Commit to get the execution ID
    await db.commit()
    await db.refresh(execution)

    # 5. Use asyncio.create_task to call start_execution(execution.id, async_session) in background
    async def _launch_runner(exec_id: int) -> None:
        try:
            from app.services.runner import start_execution

            res = start_execution(exec_id, async_session)
            if inspect.iscoroutine(res):
                await res
        except Exception as exc:
            logger.error(
                "Error during background test execution %s: %s",
                exec_id,
                exc,
                exc_info=True,
            )

    asyncio.create_task(_launch_runner(execution.id))

    # 6. Return execution response
    return execution


@router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
) -> Execution:
    """Get single execution with full log output."""
    query = (
        select(Execution)
        .options(selectinload(Execution.project))
        .where(Execution.id == execution_id)
    )
    result = await db.execute(query)
    execution = result.scalar_one_or_none()

    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Execution with id {execution_id} not found",
        )
    return execution


@router.post("/{execution_id}/cancel")
async def cancel_test_execution(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Cancel a running execution and mark status as cancelled."""
    execution = await db.get(Execution, execution_id)
    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Execution with id {execution_id} not found",
        )

    # Call cancel_execution from runner service
    try:
        from app.services.runner import cancel_execution

        res = cancel_execution(execution_id)
        if inspect.iscoroutine(res):
            await res
    except Exception as exc:
        logger.warning(
            "cancel_execution exception for execution %s: %s", execution_id, exc
        )

    execution.status = "cancelled"
    execution.finished_at = datetime.utcnow()
    await db.commit()
    await db.refresh(execution)

    return {
        "message": f"Execution {execution_id} cancelled",
        "status": "cancelled",
        "execution_id": execution_id,
    }
