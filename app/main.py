"""Main application entry point for TestRunner Pro."""

from contextlib import asynccontextmanager
import json
import logging
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import async_session, init_db, migrate_db
from app.routers import executions, projects, schedules, settings
from app.routers.settings import seed_default_settings
from app.services.app_manager import app_manager, app_ws_connections
from app.services.runner import ws_connections
from app.services.scheduler import init_scheduler, shutdown_scheduler, start_scheduler

logger = logging.getLogger("testrunner")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database...")
    await init_db()
    await migrate_db()

    # Initialize default settings
    logger.info("Initializing default settings...")
    try:
        async with async_session() as session:
            await seed_default_settings(session)
    except Exception as exc:
        logger.error("Failed to seed default settings: %s", exc, exc_info=True)

    # Initialize and start scheduler
    logger.info("Initializing scheduler...")
    try:
        await init_scheduler(async_session)
        start_scheduler()
    except Exception as exc:
        logger.error("Failed to initialize scheduler: %s", exc, exc_info=True)

    yield

    # Shutdown
    logger.info("Shutting down scheduler...")
    try:
        shutdown_scheduler()
    except Exception as exc:
        logger.error("Error shutting down scheduler: %s", exc, exc_info=True)

    logger.info("Shutting down running applications...")
    try:
        await app_manager.shutdown_all()
    except Exception as exc:
        logger.error("Error shutting down applications: %s", exc, exc_info=True)


app = FastAPI(
    title="TestRunner Pro",
    description="Professional Test Execution System",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure static and templates directory exists to prevent startup errors
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
templates_dir = static_dir / "templates"
templates_dir.mkdir(parents=True, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Include routers
app.include_router(projects.router)
app.include_router(executions.router)
app.include_router(schedules.router)
app.include_router(settings.router)


# Serve SPA
@app.get("/", response_class=HTMLResponse)
async def serve_spa():
    template_path = static_dir / "templates" / "index.html"
    if template_path.exists():
        return FileResponse(str(template_path))
    return HTMLResponse(
        """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestRunner Pro</title>
</head>
<body>
    <main style="font-family: sans-serif; padding: 2rem;">
        <h1>TestRunner Pro</h1>
        <p>Backend API is active. Access the API documentation at <a href="/docs">/docs</a>.</p>
    </main>
</body>
</html>"""
    )


# WebSocket endpoint for live execution logs
@app.websocket("/ws/execution/{execution_id}")
async def execution_ws(websocket: WebSocket, execution_id: int):
    await websocket.accept()
    if execution_id not in ws_connections:
        ws_connections[execution_id] = []
    ws_connections[execution_id].append(websocket)
    try:
        while True:
            data = await websocket.receive_text()  # Keep connection alive
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WebSocket exception for execution %s: %s", execution_id, exc)
    finally:
        if execution_id in ws_connections:
            if websocket in ws_connections[execution_id]:
                ws_connections[execution_id].remove(websocket)
            if not ws_connections[execution_id]:
                ws_connections.pop(execution_id, None)


@app.websocket("/ws/app/{project_id}")
async def app_ws(websocket: WebSocket, project_id: int):
    await websocket.accept()
    if project_id not in app_ws_connections:
        app_ws_connections[project_id] = []
    app_ws_connections[project_id].append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if project_id in app_ws_connections:
            if websocket in app_ws_connections[project_id]:
                app_ws_connections[project_id].remove(websocket)
            if not app_ws_connections[project_id]:
                app_ws_connections.pop(project_id, None)

