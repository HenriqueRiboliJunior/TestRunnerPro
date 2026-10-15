"""Settings API router."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Setting
from app.schemas import SettingResponse, SettingUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_SETTINGS: list[dict[str, str]] = [
    {
        "key": "default_browser",
        "value": "chromium",
        "category": "browser",
        "description": "Default browser used for running tests",
    },
    {
        "key": "default_headless",
        "value": "true",
        "category": "browser",
        "description": "Run tests in headless mode by default",
    },
    {
        "key": "default_timeout",
        "value": "30000",
        "category": "timeout",
        "description": "Default execution timeout in milliseconds",
    },
    {
        "key": "max_parallel_executions",
        "value": "3",
        "category": "general",
        "description": "Maximum number of parallel test executions",
    },
    {
        "key": "reports_retention_days",
        "value": "30",
        "category": "general",
        "description": "Number of days to keep test execution reports",
    },
]


async def seed_default_settings(db: AsyncSession) -> list[Setting]:
    """Initialize default settings in the database if they do not exist."""
    existing_records = await db.execute(select(Setting))
    existing_map = {s.key: s for s in existing_records.scalars().all()}

    changed = False
    for item in DEFAULT_SETTINGS:
        if item["key"] not in existing_map:
            setting = Setting(
                key=item["key"],
                value=item["value"],
                category=item["category"],
                description=item["description"],
            )
            db.add(setting)
            changed = True

    if changed:
        await db.commit()

    query = select(Setting).order_by(Setting.category, Setting.key)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("", response_model=list[SettingResponse])
@router.get("/", response_model=list[SettingResponse], include_in_schema=False)
async def list_settings(db: AsyncSession = Depends(get_db)) -> list[Setting]:
    """Get all settings ordered by category and key."""
    query = select(Setting).order_by(Setting.category, Setting.key)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.put("", response_model=list[SettingResponse])
@router.put("/", response_model=list[SettingResponse], include_in_schema=False)
async def update_settings(
    settings_in: list[SettingUpdate],
    db: AsyncSession = Depends(get_db),
) -> list[Setting]:
    """Update settings in batch via upsert."""
    for item in settings_in:
        if not item.key:
            continue
        existing = await db.scalar(select(Setting).where(Setting.key == item.key))
        if existing:
            existing.value = item.value
        else:
            new_setting = Setting(
                key=item.key,
                value=item.value,
                category="general",
            )
            db.add(new_setting)

    await db.commit()

    query = select(Setting).order_by(Setting.category, Setting.key)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post(
    "/init",
    response_model=list[SettingResponse],
    status_code=status.HTTP_200_OK,
)
async def init_settings(db: AsyncSession = Depends(get_db)) -> list[Setting]:
    """Initialize default system settings if they don't already exist."""
    return await seed_default_settings(db)
