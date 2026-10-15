"""Pydantic validation and serialization schemas."""

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


# ==========================================
# App Management Schemas
# ==========================================

class AppCommand(BaseModel):
    """Configuration for a single app startup command."""
    label: str  # Human-readable label
    command: str  # Shell command to execute
    cwd: str  # Working directory
    type: str = "daemon"  # 'daemon' or 'oneshot'
    wait_seconds: int = 3  # Seconds to wait after starting


class AppProcessStatus(BaseModel):
    """Status of a single app process."""
    label: str
    status: str  # running, stopped, error
    pid: Optional[int] = None
    type: str = "daemon"


class AppStatus(BaseModel):
    """Overall app status for a project."""
    project_id: int
    status: str  # offline, starting, online, stopping, error, partial
    processes: list[AppProcessStatus] = []
    message: str = ""


class AppLogs(BaseModel):
    """App console logs."""
    project_id: int
    logs: str = ""


# ==========================================
# Project Schemas
# ==========================================

class ProjectBase(BaseModel):
    """Base fields for a test project."""

    name: str
    path: str
    test_type: str  # 'robot' or 'playwright'
    description: Optional[str] = None
    browser: Optional[str] = "chromium"
    is_active: Optional[bool] = True
    env_vars: Optional[dict[str, Any]] = Field(default_factory=dict)
    app_commands: Optional[list[dict[str, Any]]] = Field(default_factory=list)
    auto_start_app: Optional[bool] = False


class ProjectCreate(ProjectBase):
    """Schema for creating a project."""

    pass


class ProjectUpdate(BaseModel):
    """Schema for updating an existing project (all optional fields)."""

    name: Optional[str] = None
    path: Optional[str] = None
    test_type: Optional[str] = None
    description: Optional[str] = None
    browser: Optional[str] = None
    is_active: Optional[bool] = None
    env_vars: Optional[dict[str, Any]] = None
    app_commands: Optional[list[dict[str, Any]]] = None
    auto_start_app: Optional[bool] = None


class ProjectResponse(ProjectBase):
    """Schema for returning project data."""

    id: int
    created_at: datetime
    updated_at: datetime
    app_commands: list[dict[str, Any]] = Field(default_factory=list)
    auto_start_app: bool = False

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Execution Schemas
# ==========================================

class ExecutionBase(BaseModel):
    """Base fields for a test execution."""

    project_id: int
    test_type: Optional[str] = None
    mode: Optional[str] = "full_suite"
    headless: Optional[bool] = True
    debug: Optional[bool] = False
    browser: Optional[str] = "chromium"
    selected_tests: Optional[list[str]] = Field(default_factory=list)
    tags: Optional[str] = None
    env_vars: Optional[dict[str, Any]] = Field(default_factory=dict)


class ExecutionCreate(ExecutionBase):
    """Schema for requesting a new test execution."""

    pass


class ExecutionUpdate(BaseModel):
    """Schema for updating execution status/results."""

    status: Optional[str] = None
    test_type: Optional[str] = None
    mode: Optional[str] = None
    headless: Optional[bool] = None
    debug: Optional[bool] = None
    browser: Optional[str] = None
    selected_tests: Optional[list[str]] = None
    tags: Optional[str] = None
    env_vars: Optional[dict[str, Any]] = None
    log_output: Optional[str] = None
    report_path: Optional[str] = None
    duration: Optional[float] = None
    total_tests: Optional[int] = None
    passed_tests: Optional[int] = None
    failed_tests: Optional[int] = None
    skipped_tests: Optional[int] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class ExecutionResponse(BaseModel):
    """Schema for returning execution data."""

    id: int
    project_id: int
    status: str
    test_type: str
    mode: str
    headless: bool
    debug: bool
    browser: str
    selected_tests: list[str] = Field(default_factory=list)
    tags: Optional[str] = None
    env_vars: dict[str, Any] = Field(default_factory=dict)
    log_output: str = ""
    report_path: Optional[str] = None
    duration: Optional[float] = None
    total_tests: int = 0
    passed_tests: int = 0
    failed_tests: int = 0
    skipped_tests: int = 0
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Schedule Schemas
# ==========================================

class ScheduleBase(BaseModel):
    """Base fields for a scheduled test run."""

    project_id: int
    name: str
    cron_expression: str
    mode: Optional[str] = "full_suite"
    headless: Optional[bool] = True
    browser: Optional[str] = "chromium"
    selected_tests: Optional[list[str]] = Field(default_factory=list)
    tags: Optional[str] = None
    is_active: Optional[bool] = True


class ScheduleCreate(ScheduleBase):
    """Schema for creating a new schedule."""

    pass


class ScheduleUpdate(BaseModel):
    """Schema for updating a schedule (all optional fields)."""

    project_id: Optional[int] = None
    name: Optional[str] = None
    cron_expression: Optional[str] = None
    mode: Optional[str] = None
    headless: Optional[bool] = None
    browser: Optional[str] = None
    selected_tests: Optional[list[str]] = None
    tags: Optional[str] = None
    is_active: Optional[bool] = None


class ScheduleResponse(ScheduleBase):
    """Schema for returning schedule data."""

    id: int
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Setting Schemas
# ==========================================

class SettingBase(BaseModel):
    """Base schema for application setting."""

    key: str
    value: str = ""
    category: Optional[str] = "general"
    description: Optional[str] = None


class SettingCreate(SettingBase):
    """Schema for creating an application setting."""

    pass


class SettingUpdate(BaseModel):
    """Schema for updating an application setting."""

    key: Optional[str] = None
    value: str


class SettingResponse(BaseModel):
    """Schema for returning setting data."""

    id: int
    key: str
    value: str
    category: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Dashboard & Utility Schemas
# ==========================================

class DashboardStats(BaseModel):
    """Aggregated dashboard statistics."""

    total_executions: int
    passed: int
    failed: int
    error: int
    running: int
    pass_rate: float
    recent_executions: list[ExecutionResponse]
    projects_count: int


class TestFile(BaseModel):
    """Discovered test file model."""

    path: str
    name: str
    type: str  # 'robot' or 'playwright'
