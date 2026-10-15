"""Schedules API router."""

import inspect
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import async_session, get_db
from app.models import Project, Schedule
from app.schemas import ScheduleCreate, ScheduleResponse, ScheduleUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


class ScheduleToggle(BaseModel):
    """Payload for toggling schedule active state."""

    is_active: bool


async def _safe_add_schedule(schedule: Schedule) -> None:
    """Helper to safely call add_schedule on scheduler service."""
    try:
        from app.services.scheduler import add_schedule

        # Matches add_schedule(schedule_id, cron_expression, db_session_factory)
        res = add_schedule(schedule.id, schedule.cron_expression, async_session)
        if inspect.iscoroutine(res):
            await res
    except TypeError:
        try:
            from app.services.scheduler import add_schedule

            res = add_schedule(schedule)
            if inspect.iscoroutine(res):
                await res
        except TypeError:
            try:
                res = add_schedule(schedule.id)
                if inspect.iscoroutine(res):
                    await res
            except Exception as exc:
                logger.warning("Could not add schedule by ID %s: %s", schedule.id, exc)
    except Exception as exc:
        logger.warning("Could not add schedule %s to scheduler: %s", schedule.id, exc)


async def _safe_remove_schedule(schedule_id: int) -> None:
    """Helper to safely call remove_schedule on scheduler service."""
    try:
        from app.services.scheduler import remove_schedule

        res = remove_schedule(schedule_id)
        if inspect.iscoroutine(res):
            await res
    except Exception as exc:
        logger.warning(
            "Could not remove schedule %s from scheduler: %s", schedule_id, exc
        )


async def _safe_toggle_schedule(schedule: Schedule, is_active: bool) -> None:
    """Helper to safely call toggle_schedule on scheduler service."""
    try:
        from app.services.scheduler import toggle_schedule

        # Matches toggle_schedule(schedule_id, is_active, db_session_factory)
        res = toggle_schedule(schedule.id, is_active, async_session)
        if inspect.iscoroutine(res):
            await res
    except TypeError:
        try:
            from app.services.scheduler import toggle_schedule

            res = toggle_schedule(schedule.id, is_active)
            if inspect.iscoroutine(res):
                await res
        except TypeError:
            try:
                res = toggle_schedule(schedule, is_active)
                if inspect.iscoroutine(res):
                    await res
            except Exception:
                pass
    except Exception as exc:
        logger.warning(
            "Could not toggle schedule %s in scheduler: %s", schedule.id, exc
        )


@router.get("", response_model=list[ScheduleResponse])
@router.get("/", response_model=list[ScheduleResponse], include_in_schema=False)
async def list_schedules(db: AsyncSession = Depends(get_db)) -> list[Schedule]:
    """List all scheduled test runs ordered by creation date descending."""
    query = (
        select(Schedule)
        .options(selectinload(Schedule.project))
        .order_by(Schedule.created_at.desc())
    )
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post(
    "",
    response_model=ScheduleResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/",
    response_model=ScheduleResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def create_schedule(
    schedule_in: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
) -> Schedule:
    """Create a new schedule and register it with the background scheduler."""
    project = await db.get(Project, schedule_in.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id {schedule_in.project_id} not found",
        )

    schedule = Schedule(**schedule_in.model_dump())
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)

    if schedule.is_active:
        await _safe_add_schedule(schedule)

    return schedule


@router.put("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: int,
    schedule_update: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
) -> Schedule:
    """Update a schedule. If cron changed, remove and re-add in scheduler."""
    schedule = await db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule with id {schedule_id} not found",
        )

    update_data = schedule_update.model_dump(exclude_unset=True)
    cron_changed = (
        "cron_expression" in update_data
        and update_data["cron_expression"] is not None
        and update_data["cron_expression"] != schedule.cron_expression
    )

    for field, value in update_data.items():
        setattr(schedule, field, value)

    await db.commit()
    await db.refresh(schedule)

    if cron_changed:
        await _safe_remove_schedule(schedule.id)
        if schedule.is_active:
            await _safe_add_schedule(schedule)

    return schedule


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Delete a schedule and unregister it from scheduler service."""
    schedule = await db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule with id {schedule_id} not found",
        )

    await _safe_remove_schedule(schedule.id)
    await db.delete(schedule)
    await db.commit()

    return {"message": f"Schedule {schedule_id} deleted successfully"}


@router.post("/{schedule_id}/toggle", response_model=ScheduleResponse)
async def toggle_schedule_active(
    schedule_id: int,
    payload: ScheduleToggle,
    db: AsyncSession = Depends(get_db),
) -> Schedule:
    """Toggle schedule active or inactive status."""
    schedule = await db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule with id {schedule_id} not found",
        )

    schedule.is_active = payload.is_active
    await db.commit()
    await db.refresh(schedule)

    await _safe_toggle_schedule(schedule, payload.is_active)

    return schedule
