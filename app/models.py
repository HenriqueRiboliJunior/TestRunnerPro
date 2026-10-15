"""SQLAlchemy ORM models for TestRunner Pro."""

from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Project(Base):
    """Test project model representing a test suite on the filesystem."""

    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    path = Column(String(500), nullable=False)
    test_type = Column(String(20), nullable=False)  # 'robot' or 'playwright'
    description = Column(Text, nullable=True)
    browser = Column(String(20), nullable=False, default="chromium")
    is_active = Column(Boolean, nullable=False, default=True)
    env_vars = Column(JSON, nullable=False, default=dict)
    app_commands = Column(JSON, nullable=False, default=list)  # List of startup command objects
    auto_start_app = Column(Boolean, nullable=False, default=False)  # Auto-start before tests
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    executions = relationship(
        "Execution",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    schedules = relationship(
        "Schedule",
        back_populates="project",
        cascade="all, delete-orphan",
    )


class Execution(Base):
    """Test execution run model."""

    __tablename__ = "executions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="pending")  # pending/running/passed/failed/cancelled/error
    test_type = Column(String(20), nullable=False)
    mode = Column(String(20), nullable=False, default="full_suite")  # full_suite/specific_tests/by_tag
    headless = Column(Boolean, nullable=False, default=True)
    debug = Column(Boolean, nullable=False, default=False)
    browser = Column(String(20), nullable=False, default="chromium")
    selected_tests = Column(JSON, nullable=False, default=list)
    tags = Column(String(200), nullable=True)
    env_vars = Column(JSON, nullable=False, default=dict)
    log_output = Column(Text, nullable=False, default="")
    report_path = Column(String(500), nullable=True)
    duration = Column(Float, nullable=True)
    total_tests = Column(Integer, nullable=False, default=0)
    passed_tests = Column(Integer, nullable=False, default=0)
    failed_tests = Column(Integer, nullable=False, default=0)
    skipped_tests = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project = relationship("Project", back_populates="executions")


class Schedule(Base):
    """Scheduled test run model."""

    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    cron_expression = Column(String(50), nullable=False)
    mode = Column(String(20), nullable=False, default="full_suite")
    headless = Column(Boolean, nullable=False, default=True)
    browser = Column(String(20), nullable=False, default="chromium")
    selected_tests = Column(JSON, nullable=False, default=list)
    tags = Column(String(200), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    last_run = Column(DateTime, nullable=True)
    next_run = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project = relationship("Project", back_populates="schedules")


class Setting(Base):
    """Global configuration setting model."""

    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False, default="")
    category = Column(String(50), nullable=False, default="general")
    description = Column(String(200), nullable=True)
