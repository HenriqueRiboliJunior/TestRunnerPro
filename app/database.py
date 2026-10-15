"""Database connection and session management."""

from collections.abc import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)
async_session = AsyncSessionLocal

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency injection helper for getting an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def migrate_db() -> None:
    """Apply schema migrations for new columns."""
    async with engine.begin() as conn:
        # Add new columns if they don't exist
        try:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN app_commands JSON DEFAULT '[]'"))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN auto_start_app BOOLEAN DEFAULT 0"))
        except Exception:
            pass  # Column already exists

