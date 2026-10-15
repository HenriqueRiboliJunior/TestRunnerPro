"""Scheduler service using APScheduler."""

import asyncio
import logging
from datetime import datetime
from typing import Any, Callable, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Execution, Project, Schedule
from app.services.runner import start_execution

logger = logging.getLogger(__name__)

# Global AsyncIOScheduler instance
scheduler = AsyncIOScheduler()


def start_scheduler() -> None:
    """Start the APScheduler if not already running."""
    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started.")


def shutdown_scheduler() -> None:
    """Shut down the APScheduler if running."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down.")


async def add_schedule(
    schedule_id: int,
    cron_expression: str,
    db_session_factory: Callable[[], Any],
) -> None:
    """Add or replace a scheduled job in APScheduler and update next_run in DB."""
    job_id = f"schedule_{schedule_id}"
    await remove_schedule(schedule_id)

    trigger = CronTrigger.from_crontab(cron_expression)
    job = scheduler.add_job(
        execute_scheduled,
        trigger=trigger,
        id=job_id,
        args=[schedule_id, db_session_factory],
        replace_existing=True,
    )

    # Calculate and store next_run
    next_run_time: Optional[datetime] = None
    if job and job.next_run_time:
        next_run_time = job.next_run_time.replace(tzinfo=None)

    try:
        async with db_session_factory() as session:
            schedule = await session.get(Schedule, schedule_id)
            if schedule:
                schedule.next_run = next_run_time
                await session.commit()
    except Exception as exc:
        logger.warning("Failed to update next_run for schedule %s: %s", schedule_id, exc)


async def remove_schedule(schedule_id: int) -> None:
    """Remove a scheduled job from APScheduler."""
    job_id = f"schedule_{schedule_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("Removed job %s from scheduler.", job_id)


async def toggle_schedule(
    schedule_id: int,
    is_active: bool,
    db_session_factory: Callable[[], Any],
) -> None:
    """Activate or deactivate a schedule."""
    async with db_session_factory() as session:
        schedule = await session.get(Schedule, schedule_id)
        if not schedule:
            logger.warning("Schedule %s not found for toggle.", schedule_id)
            return

        schedule.is_active = is_active
        cron_expr = schedule.cron_expression
        if not is_active:
            schedule.next_run = None
        await session.commit()

    if is_active and cron_expr:
        await add_schedule(schedule_id, cron_expr, db_session_factory)
    else:
        await remove_schedule(schedule_id)


async def execute_scheduled(
    schedule_id: int,
    db_session_factory: Callable[[], Any],
) -> None:
    """
    Callback triggered by APScheduler when a cron fires:
    1. Load schedule and associated project from DB.
    2. Create a new Execution record populated from schedule parameters.
    3. Update schedule.last_run and schedule.next_run.
    4. Start the execution asynchronously via start_execution().
    """
    logger.info("Executing scheduled job for schedule %s", schedule_id)

    async with db_session_factory() as session:
        schedule = await session.get(Schedule, schedule_id)
        if not schedule or not schedule.is_active:
            logger.info("Schedule %s is inactive or does not exist. Skipping.", schedule_id)
            return

        project = await session.get(Project, schedule.project_id)
        test_type = project.test_type if project else "playwright"
        env_vars = project.env_vars if project else {}

        execution = Execution(
            project_id=schedule.project_id,
            status="pending",
            test_type=test_type,
            mode=schedule.mode,
            headless=schedule.headless,
            browser=schedule.browser,
            selected_tests=schedule.selected_tests or [],
            tags=schedule.tags,
            env_vars=env_vars,
            log_output="",
            created_at=datetime.utcnow(),
        )
        session.add(execution)

        # Update last run and next run
        schedule.last_run = datetime.utcnow()
        job = scheduler.get_job(f"schedule_{schedule_id}")
        if job and job.next_run_time:
            schedule.next_run = job.next_run_time.replace(tzinfo=None)

        await session.commit()
        await session.refresh(execution)
        execution_id = execution.id

    # Launch execution asynchronously
    asyncio.create_task(start_execution(execution_id, db_session_factory))


async def init_scheduler(db_session_factory: Callable[[], Any]) -> None:
    """Load all active schedules from DB and add them to the scheduler."""
    start_scheduler()
    async with db_session_factory() as session:
        stmt = select(Schedule).where(Schedule.is_active.is_(True))
        result = await session.execute(stmt)
        schedules = result.scalars().all()

        for schedule in schedules:
            try:
                await add_schedule(schedule.id, schedule.cron_expression, db_session_factory)
            except Exception as exc:
                logger.error("Failed to initialize schedule %s: %s", schedule.id, exc)
