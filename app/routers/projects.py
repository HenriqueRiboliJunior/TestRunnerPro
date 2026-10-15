"""Projects API router."""

import inspect
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Project
from app.schemas import ProjectCreate, ProjectResponse, ProjectUpdate, TestFile
from app.services.app_manager import app_manager, app_ws_connections

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
@router.get("/", response_model=list[ProjectResponse], include_in_schema=False)
async def list_projects(db: AsyncSession = Depends(get_db)) -> list[Project]:
    """List all projects ordered by name."""
    query = select(Project).order_by(Project.name.asc())
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def create_project(
    project_in: ProjectCreate,
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Create a new project after validating the filesystem path."""
    project_path = Path(project_in.path).expanduser().resolve()
    if not project_path.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Project path does not exist on filesystem: {project_in.path}",
        )

    # Check for name uniqueness
    existing_project = await db.scalar(
        select(Project).where(Project.name == project_in.name)
    )
    if existing_project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Project with name '{project_in.name}' already exists",
        )

    project = Project(**project_in.model_dump())
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Get a single project by ID."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id {project_id} not found",
        )
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_update: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Update project details."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id {project_id} not found",
        )

    update_data = project_update.model_dump(exclude_unset=True)

    # Validate path if changed
    if "path" in update_data and update_data["path"] is not None:
        new_path = Path(update_data["path"]).expanduser().resolve()
        if not new_path.exists():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Project path does not exist on filesystem: {update_data['path']}",
            )

    # Validate name uniqueness if changed
    if (
        "name" in update_data
        and update_data["name"] is not None
        and update_data["name"] != project.name
    ):
        duplicate_name = await db.scalar(
            select(Project).where(
                Project.name == update_data["name"], Project.id != project_id
            )
        )
        if duplicate_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Project with name '{update_data['name']}' already exists",
            )

    for field, value in update_data.items():
        setattr(project, field, value)

    project.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Delete project along with cascading executions and schedules."""
    query = (
        select(Project)
        .options(selectinload(Project.schedules), selectinload(Project.executions))
        .where(Project.id == project_id)
    )
    result = await db.execute(query)
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id {project_id} not found",
        )

    # Clean up any active scheduler jobs for this project's schedules
    for schedule in project.schedules:
        try:
            from app.services.scheduler import remove_schedule

            res = remove_schedule(schedule.id)
            if inspect.iscoroutine(res):
                await res
        except Exception as exc:
            logger.debug("Failed to remove schedule %s from scheduler: %s", schedule.id, exc)

    await db.delete(project)
    await db.commit()
    return {"message": f"Project {project_id} deleted successfully"}


@router.get("/{project_id}/tests", response_model=list[TestFile])
async def get_project_tests(
    project_id: int,
    db: AsyncSession = Depends(get_db),
) -> list[TestFile]:
    """Discover tests in a project directory based on test type."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id {project_id} not found",
        )

    try:
        from app.services.discovery import discover_tests

        tests = discover_tests(project.path, project.test_type)
        if inspect.iscoroutine(tests):
            tests = await tests
        return tests
    except Exception as exc:
        logger.error(
            "Error discovering tests for project %s (%s): %s",
            project_id,
            project.path,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to discover tests: {str(exc)}",
        )


@router.post("/{project_id}/app/start")
async def start_project_app(project_id: int, db: AsyncSession = Depends(get_db)):
    """Start the application for a project."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not project.app_commands:
        raise HTTPException(status_code=400, detail="Nenhum comando de inicialização configurado")

    result = await app_manager.start_app(project_id, project.app_commands)
    return result


@router.post("/{project_id}/app/stop")
async def stop_project_app(project_id: int, db: AsyncSession = Depends(get_db)):
    """Stop the application for a project."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    result = await app_manager.stop_app(project_id)
    return result


@router.get("/{project_id}/app/status")
async def get_app_status(project_id: int):
    """Get current app status."""
    return app_manager.get_status(project_id)


@router.get("/{project_id}/app/logs")
async def get_app_logs(project_id: int):
    """Get combined app logs."""
    return {"project_id": project_id, "logs": app_manager.get_logs(project_id)}


@router.get("/apps/running", response_model=None)
async def list_running_apps(db: AsyncSession = Depends(get_db)):
    """List all currently running applications with their project names."""
    running = []
    for pid, app_obj in app_manager.apps.items():
        app_obj._update_status()
        if app_obj.status in ("online", "partial", "starting"):
            project = await db.get(Project, pid)
            project_name = project.name if project else f"Projeto #{pid}"
            status_info = app_obj.get_status_dict()
            status_info["project_name"] = project_name
            running.append(status_info)
    return running
