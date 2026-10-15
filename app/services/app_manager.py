"""Application process manager for starting/stopping apps under test."""

import asyncio
import logging
import os
import signal
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Global dict for WebSocket connections per project app
app_ws_connections: Dict[int, List[Any]] = {}


class AppProcess:
    """Represents a single running application process."""

    def __init__(self, label: str, command: str, cwd: str, proc_type: str = "daemon"):
        self.label = label
        self.command = command
        self.cwd = cwd
        self.proc_type = proc_type  # daemon or oneshot
        self.process: Optional[asyncio.subprocess.Process] = None
        self.status: str = "stopped"  # stopped, running, error
        self.pid: Optional[int] = None
        self.log_lines: list[str] = []
        self._reader_task: Optional[asyncio.Task] = None

    async def start(self, on_output=None) -> bool:
        """Start the process."""
        try:
            env = os.environ.copy()
            kwargs = {}
            if sys.platform != "win32":
                kwargs["preexec_fn"] = os.setsid  # Process group on POSIX
            else:
                kwargs["creationflags"] = getattr(signal, "CTRL_BREAK_EVENT", 0x00000200)

            self.process = await asyncio.create_subprocess_shell(
                self.command,
                cwd=self.cwd,
                env=env,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                **kwargs,
            )
            self.pid = self.process.pid
            self.status = "running"

            # Start background reader task for stdout
            self._reader_task = asyncio.create_task(self._read_output(on_output))
            return True
        except Exception as e:
            self.status = "error"
            error_msg = f"[{self.label}] Erro ao iniciar: {e}"
            self.log_lines.append(error_msg)
            logger.error(error_msg)
            return False

    async def _read_output(self, on_output=None):
        """Read process stdout line by line."""
        try:
            while self.process and self.process.stdout:
                line_bytes = await self.process.stdout.readline()
                if not line_bytes:
                    break
                line = line_bytes.decode('utf-8', errors='replace').rstrip('\r\n')
                prefixed = f"[{self.label}] {line}"
                self.log_lines.append(prefixed)
                # Keep max 5000 lines
                if len(self.log_lines) > 5000:
                    self.log_lines = self.log_lines[-4000:]
                if on_output:
                    try:
                        await on_output(prefixed)
                    except:
                        pass

            # Process ended
            if self.process:
                await self.process.wait()
                if self.proc_type == "daemon" and self.process.returncode != 0:
                    self.status = "error"
                elif self.proc_type == "oneshot":
                    self.status = "stopped" if self.process.returncode == 0 else "error"
                else:
                    self.status = "stopped"
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Error reading output for %s: %s", self.label, e)

    async def stop(self):
        """Stop the process."""
        if self._reader_task:
            self._reader_task.cancel()

        if self.process and self.process.returncode is None:
            try:
                if sys.platform == "win32":
                    self.process.terminate()
                    try:
                        await asyncio.wait_for(self.process.wait(), timeout=5)
                    except asyncio.TimeoutError:
                        self.process.kill()
                else:
                    # Kill the entire process group on POSIX
                    os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
                    try:
                        await asyncio.wait_for(self.process.wait(), timeout=10)
                    except asyncio.TimeoutError:
                        os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
            except ProcessLookupError:
                pass
            except Exception as e:
                logger.warning("Error stopping process %s: %s", self.label, e)

        self.status = "stopped"
        self.pid = None

    @property
    def is_running(self) -> bool:
        if self.proc_type == "oneshot":
            return False  # Oneshot processes are not expected to stay running
        return self.process is not None and self.process.returncode is None


class ProjectApp:
    """Manages all processes for a project's application."""

    def __init__(self, project_id: int):
        self.project_id = project_id
        self.processes: list[AppProcess] = []
        self.status: str = "offline"  # offline, starting, online, stopping, error, partial
        self.started_at: Optional[datetime] = None

    async def start(self, commands: list[dict], on_output=None) -> str:
        """Start all application processes sequentially."""
        self.status = "starting"
        self.processes = []
        self.started_at = datetime.utcnow()

        for cmd_config in commands:
            label = cmd_config.get("label", "App")
            command = cmd_config.get("command", "")
            cwd = cmd_config.get("cwd", ".")
            proc_type = cmd_config.get("type", "daemon")
            wait_seconds = cmd_config.get("wait_seconds", 3)

            if not command:
                continue

            # Expand ~ in cwd
            cwd = os.path.expanduser(cwd)

            if not Path(cwd).exists():
                error_msg = f"[{label}] Diretório não encontrado: {cwd}"
                if on_output:
                    await on_output(error_msg)
                logger.error(error_msg)
                continue

            start_msg = f"[{label}] Executando: {command} (em {cwd})"
            if on_output:
                await on_output(start_msg)

            proc = AppProcess(label, command, cwd, proc_type)
            self.processes.append(proc)

            success = await proc.start(on_output)
            if not success:
                self.status = "error"
                return self.status

            # Wait for command to initialize
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)

            # For oneshot, wait for completion
            if proc_type == "oneshot" and proc.process:
                try:
                    await asyncio.wait_for(proc.process.wait(), timeout=120)
                except asyncio.TimeoutError:
                    error_msg = f"[{label}] Timeout aguardando conclusão do comando"
                    if on_output:
                        await on_output(error_msg)

        # Check status
        self._update_status()

        status_msg = f"[Sistema] Aplicação {'online ✅' if self.status == 'online' else 'com problemas ⚠️'}"
        if on_output:
            await on_output(status_msg)

        return self.status

    async def stop(self, on_output=None):
        """Stop all application processes."""
        self.status = "stopping"
        if on_output:
            await on_output("[Sistema] Desligando aplicação...")

        for proc in reversed(self.processes):
            if on_output:
                await on_output(f"[{proc.label}] Parando...")
            await proc.stop()
            if on_output:
                await on_output(f"[{proc.label}] Parado ✓")

        self.status = "offline"
        self.started_at = None
        if on_output:
            await on_output("[Sistema] Aplicação desligada ✅")

    def _update_status(self):
        """Update overall status based on individual process statuses."""
        daemon_procs = [p for p in self.processes if p.proc_type == "daemon"]
        if not daemon_procs:
            # Only oneshot commands, check if any errored
            errors = [p for p in self.processes if p.status == "error"]
            self.status = "error" if errors else "online"
            return

        running = [p for p in daemon_procs if p.is_running]
        errors = [p for p in daemon_procs if p.status == "error"]

        if len(running) == len(daemon_procs):
            self.status = "online"
        elif len(running) > 0:
            self.status = "partial"
        elif errors:
            self.status = "error"
        else:
            self.status = "offline"

    def get_combined_logs(self) -> str:
        """Get combined logs from all processes."""
        all_lines = []
        for proc in self.processes:
            all_lines.extend(proc.log_lines)
        return "\n".join(all_lines)

    def get_status_dict(self) -> dict:
        """Get status as a serializable dict."""
        self._update_status()
        return {
            "project_id": self.project_id,
            "status": self.status,
            "processes": [
                {
                    "label": p.label,
                    "status": "running" if p.is_running else p.status,
                    "pid": p.pid,
                    "type": p.proc_type,
                }
                for p in self.processes
            ],
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "message": "",
        }


# === Singleton App Manager ===

class AppManager:
    """Global application manager singleton."""

    def __init__(self):
        self.apps: Dict[int, ProjectApp] = {}

    def get_app(self, project_id: int) -> Optional[ProjectApp]:
        return self.apps.get(project_id)

    def get_status(self, project_id: int) -> dict:
        app = self.apps.get(project_id)
        if app:
            return app.get_status_dict()
        return {
            "project_id": project_id,
            "status": "offline",
            "processes": [],
            "started_at": None,
            "message": "",
        }

    def is_online(self, project_id: int) -> bool:
        app = self.apps.get(project_id)
        if app:
            app._update_status()
            return app.status in ("online", "partial")
        return False

    async def start_app(self, project_id: int, commands: list[dict]) -> dict:
        """Start application for a project."""
        # If already running, return current status
        if self.is_online(project_id):
            return self.get_status(project_id)

        # Stop any existing processes first
        if project_id in self.apps:
            await self.apps[project_id].stop()

        app = ProjectApp(project_id)
        self.apps[project_id] = app

        async def on_output(line: str):
            await broadcast_app_ws(project_id, line)

        await app.start(commands, on_output)
        return app.get_status_dict()

    async def stop_app(self, project_id: int) -> dict:
        """Stop application for a project."""
        app = self.apps.get(project_id)
        if app:
            async def on_output(line: str):
                await broadcast_app_ws(project_id, line)

            await app.stop(on_output)
            del self.apps[project_id]

        return self.get_status(project_id)

    def get_logs(self, project_id: int) -> str:
        app = self.apps.get(project_id)
        if app:
            return app.get_combined_logs()
        return ""

    async def shutdown_all(self):
        """Stop all running applications."""
        for project_id in list(self.apps.keys()):
            await self.stop_app(project_id)


# Global singleton instance
app_manager = AppManager()


async def broadcast_app_ws(project_id: int, message: str):
    """Broadcast a message to all WebSocket connections for a project's app."""
    connections = app_ws_connections.get(project_id, [])
    if not connections:
        return
    dead = []
    for ws in list(connections):
        try:
            await ws.send_text(message)
        except:
            dead.append(ws)
    for ws in dead:
        if ws in connections:
            connections.remove(ws)
