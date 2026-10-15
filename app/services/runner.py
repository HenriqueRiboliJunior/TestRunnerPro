"""Main test runner orchestrator service."""

import asyncio
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Execution, Project
from app.services.app_manager import app_manager
from app.services.cypress_runner import CypressRunner
from app.services.k6_runner import K6Runner
from app.services.newman_runner import NewmanRunner
from app.services.playwright_runner import PlaywrightRunner
from app.services.pytest_runner import PytestRunner
from app.services.robot_runner import RobotRunner

logger = logging.getLogger(__name__)

# Global dictionary to track currently active runners by execution_id
active_runners: Dict[int, Any] = {}

# Global dictionary for active WebSocket connections per execution_id
ws_connections: Dict[int, List[Any]] = {}


def register_ws(execution_id: int, websocket: Any) -> None:
    """Register an active WebSocket connection for an execution."""
    if execution_id not in ws_connections:
        ws_connections[execution_id] = []
    if websocket not in ws_connections[execution_id]:
        ws_connections[execution_id].append(websocket)


def unregister_ws(execution_id: int, websocket: Any) -> None:
    """Unregister a WebSocket connection."""
    if execution_id in ws_connections:
        if websocket in ws_connections[execution_id]:
            ws_connections[execution_id].remove(websocket)
        if not ws_connections[execution_id]:
            ws_connections.pop(execution_id, None)


async def broadcast_to_ws(execution_id: int, message: str) -> None:
    """
    Send a message to all active WebSocket connections subscribed to an execution.
    Automatically unregisters disconnected or closed connections.
    """
    connections = ws_connections.get(execution_id, [])
    if not connections:
        return

    disconnected: list[Any] = []
    for ws in list(connections):
        try:
            if hasattr(ws, "send_text"):
                await ws.send_text(message)
            elif hasattr(ws, "send"):
                await ws.send(message)
        except Exception:
            disconnected.append(ws)

    for dead_ws in disconnected:
        if dead_ws in connections:
            connections.remove(dead_ws)

    if execution_id in ws_connections and not ws_connections[execution_id]:
        ws_connections.pop(execution_id, None)


async def cancel_execution(execution_id: int) -> bool:
    """
    Cancel an ongoing execution.
    Returns True if an active runner was found and cancelled, False otherwise.
    """
    runner = active_runners.get(execution_id)
    if runner:
        runner.cancel()
        return True
    return False


async def start_execution(execution_id: int, db_session_factory: Callable[[], Any]) -> None:
    """
    Execute a test run:
    1. Create a DB session and retrieve execution and project records.
    2. Set execution status to 'running' with started_at timestamp.
    3. Prepare reports output directory.
    4. Select RobotRunner or PlaywrightRunner based on test type.
    5. Register runner in active_runners.
    6. Stream console output to WebSockets and periodically buffer to DB.
    7. Execute runner and update execution record with results.
    8. Mark execution finished and clean up active runner.
    """
    settings = get_settings()

    async with db_session_factory() as session:
        stmt = select(Execution).where(Execution.id == execution_id)
        result = await session.execute(stmt)
        execution = result.scalar_one_or_none()

        if not execution:
            logger.error("Execution %s not found in database.", execution_id)
            return

        proj_stmt = select(Project).where(Project.id == execution.project_id)
        proj_result = await session.execute(proj_stmt)
        project = proj_result.scalar_one_or_none()

        if not project:
            logger.error("Project %s for execution %s not found.", execution.project_id, execution_id)
            execution.status = "error"
            execution.log_output = f"Associated project ID {execution.project_id} not found."
            execution.finished_at = datetime.utcnow()
            await session.commit()
            return

        # Update initial running state
        execution.status = "running"
        execution.started_at = datetime.utcnow()
        await session.commit()

        # Cache parameters before running
        project_path = project.path
        project_id = project.id
        project_env = project.env_vars or {}
        project_browser = project.browser or "chromium"
        project_auto_start_app = project.auto_start_app or False
        project_app_commands = list(project.app_commands or [])
        test_type = (execution.test_type or project.test_type or "playwright").lower()
        mode = execution.mode or "full_suite"
        headless = execution.headless if execution.headless is not None else True
        debug = execution.debug if execution.debug is not None else False
        browser = execution.browser or project_browser
        selected_tests = list(execution.selected_tests or [])
        tags = execution.tags
        merged_env = {**project_env, **(execution.env_vars or {})}

    # Create output directory for execution artifacts and reports
    reports_base = Path(settings.REPORTS_DIR).resolve()
    output_dir = reports_base / f"execution_{execution_id}"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Initialize appropriate runner
    if test_type == "robot":
        runner: Any = RobotRunner()
    elif test_type == "cypress":
        runner = CypressRunner()
    elif test_type == "pytest":
        runner = PytestRunner()
    elif test_type in ("newman", "postman"):
        runner = NewmanRunner()
    elif test_type == "k6":
        runner = K6Runner()
    else:
        runner = PlaywrightRunner()

    active_runners[execution_id] = runner

    # Output streaming and buffering
    log_lines: list[str] = []
    buffer_flush_interval = 50

    async def on_output(line: str) -> None:
        log_lines.append(line)
        await broadcast_to_ws(execution_id, line)

        if len(log_lines) % buffer_flush_interval == 0:
            try:
                async with db_session_factory() as update_session:
                    rec = await update_session.get(Execution, execution_id)
                    if rec:
                        rec.log_output = "\n".join(log_lines)
                        await update_session.commit()
            except Exception as err:
                logger.warning("Failed to buffer log chunk to DB for execution %s: %s", execution_id, err)

    # Auto-start application if configured
    auto_started_app = False
    if project_auto_start_app and project_app_commands:
        existing_app = app_manager.apps.get(project_id)
        if existing_app and app_manager.is_online(project_id):
            auto_started_app = False
            await on_output("ℹ️ Aplicação já está online (iniciada previamente pelo usuário). Mantendo ativa durante os testes...")
        else:
            # Check for conflict with other projects and stop them
            conflict = app_manager.check_conflicts(project_id)
            if conflict:
                await on_output(f"⚠️ Detectada outra aplicação em execução (Projeto #{conflict['conflict_project_id']}). Desligando para liberar portas...")
                await app_manager.stop_app(conflict["conflict_project_id"])
                await asyncio.sleep(1)

            auto_started_app = True
            await on_output("🚀 Iniciando aplicação automaticamente antes dos testes...")
            status_result = await app_manager.start_app(project_id, project_app_commands, started_by="auto")
            if status_result["status"] in ("online", "partial"):
                await on_output("✅ Aplicação online! Iniciando testes...")
            else:
                await on_output(f"⚠️ Aplicação com status: {status_result['status']}. Tentando executar testes mesmo assim...")
            await asyncio.sleep(2)  # Extra wait for app stability

    status = "error"
    duration = 0.0
    total_tests = 0
    passed_tests = 0
    failed_tests = 0
    skipped_tests = 0
    report_path: Optional[str] = None
    final_log = ""

    try:
        # Timeout: 30 minutes max per execution (1800s)
        execution_timeout = 1800
        results = await asyncio.wait_for(
            runner.run(
                project_path=project_path,
                mode=mode,
                headless=headless,
                debug=debug,
                browser=browser,
                selected_tests=selected_tests,
                tags=tags,
                env_vars=merged_env,
                output_dir=str(output_dir),
                on_output=on_output,
            ),
            timeout=execution_timeout,
        )

        status = results.get("status", "error")
        duration = float(results.get("duration", 0.0))
        total_tests = int(results.get("total_tests", results.get("total", 0)))
        passed_tests = int(results.get("passed_tests", results.get("passed", 0)))
        failed_tests = int(results.get("failed_tests", results.get("failed", 0)))
        skipped_tests = int(results.get("skipped_tests", results.get("skipped", 0)))
        report_path = results.get("report_path")
        final_log = "\n".join(log_lines) if log_lines else results.get("log_output", "")

    except asyncio.TimeoutError:
        logger.error("Execution %s timed out after %s seconds", execution_id, execution_timeout)
        status = "error"
        runner.cancel()
        err_msg = f"\n⏱️ Execução excedeu o timeout de {execution_timeout // 60} minutos e foi cancelada."
        log_lines.append(err_msg)
        final_log = "\n".join(log_lines)
        await broadcast_to_ws(execution_id, err_msg)

    except Exception as exc:
        logger.exception("Error executing run for execution %s: %s", execution_id, exc)
        status = "error"
        err_msg = f"\nExecution runner encountered an unexpected error: {exc}"
        log_lines.append(err_msg)
        final_log = "\n".join(log_lines)
        await broadcast_to_ws(execution_id, err_msg)

    finally:
        active_runners.pop(execution_id, None)

    # Auto-stop application ONLY if it was auto-started by the runner (keep alive if manually started)
    app_rec = app_manager.apps.get(project_id)
    if auto_started_app and app_rec and getattr(app_rec, "started_by", None) == "auto":
        await on_output("🔄 Desligando aplicação (iniciada automaticamente para os testes)...")
        await app_manager.stop_app(project_id)
        await on_output("⏹️ Aplicação desligada automaticamente.")
    elif app_rec and getattr(app_rec, "started_by", None) == "manual":
        await on_output("ℹ️ Aplicação foi iniciada manualmente pelo usuário e permanecerá em execução.")

    # Re-assemble final log so shutdown messages are included
    final_log = "\n".join(log_lines) if log_lines else final_log

    # Persist final execution record
    try:
        async with db_session_factory() as final_session:
            rec = await final_session.get(Execution, execution_id)
            if rec:
                rec.status = status
                rec.duration = duration
                rec.total_tests = total_tests
                rec.passed_tests = passed_tests
                rec.failed_tests = failed_tests
                rec.skipped_tests = skipped_tests
                rec.report_path = report_path
                rec.log_output = final_log
                rec.finished_at = datetime.utcnow()
                await final_session.commit()
    except Exception as exc:
        logger.exception("Failed to update final execution status in DB for %s: %s", execution_id, exc)

    # Broadcast completion event
    await broadcast_to_ws(execution_id, f"__COMPLETED__:{status}")
