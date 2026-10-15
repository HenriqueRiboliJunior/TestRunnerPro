"""Newman (Postman collections) test runner service."""

import asyncio
import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional


def _strip_ansi(text: str) -> str:
    """Remove ANSI escape sequences from console text."""
    ansi_regex = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")
    return ansi_regex.sub("", text)


class NewmanRunner:
    """Runner for executing Postman collections via Newman CLI."""

    def __init__(self) -> None:
        self.process: Optional[asyncio.subprocess.Process] = None
        self.is_cancelled: bool = False

    def cancel(self) -> None:
        """Cancel the running test execution."""
        self.is_cancelled = True
        if self.process:
            try:
                self.process.terminate()
            except ProcessLookupError:
                pass
            except Exception:
                pass

    def _parse_results_from_log(self, log_text: str) -> tuple[int, int, int, int]:
        """Parse test assertions and requests from Newman output table."""
        clean = _strip_ansi(log_text)

        # Newman summary table contains lines like:
        # │ total run duration: 1.2s
        # │ total data received: 2.14KB
        # │ average response time: 240ms
        # ┌─────────────────────────┬──────────┬──────────┐
        # │                         │ executed │   failed │
        # ├─────────────────────────┼──────────┼──────────┤
        # │ iterations              │        1 │        0 │
        # │ requests                │        4 │        0 │
        # │ test-scripts            │        4 │        0 │
        # │ prerequest-scripts      │        0 │        0 │
        # │ assertions              │        8 │        1 │

        assertions_match = re.search(r"assertions\s*│\s*(\d+)\s*│\s*(\d+)", clean)
        requests_match = re.search(r"requests\s*│\s*(\d+)\s*│\s*(\d+)", clean)

        if assertions_match:
            total_asserts = int(assertions_match.group(1))
            failed_asserts = int(assertions_match.group(2))
            passed_asserts = max(0, total_asserts - failed_asserts)
            return total_asserts, passed_asserts, failed_asserts, 0
        elif requests_match:
            total_reqs = int(requests_match.group(1))
            failed_reqs = int(requests_match.group(2))
            passed_reqs = max(0, total_reqs - failed_reqs)
            return total_reqs, passed_reqs, failed_reqs, 0

        # Fallback counts
        failures = len(re.findall(r"(\d+\)\s+[A-Za-z0-9_]+)", clean))
        return (1 if failures == 0 else failures), (1 if failures == 0 else 0), failures, 0

    async def run(
        self,
        project_path: str,
        mode: str = "full_suite",
        headless: bool = True,
        debug: bool = False,
        browser: str = "chromium",
        selected_tests: Optional[list[str]] = None,
        tags: Optional[str] = None,
        env_vars: Optional[dict[str, Any]] = None,
        output_dir: Optional[str] = None,
        on_output: Optional[Callable[[str], Any]] = None,
    ) -> dict[str, Any]:
        """Execute Postman collection via newman run."""
        self.is_cancelled = False
        start_time = datetime.utcnow()
        log_lines: list[str] = []

        if not output_dir:
            output_dir = os.path.join(project_path, "reports", "newman")
        output_path = Path(output_dir).resolve()
        output_path.mkdir(parents=True, exist_ok=True)

        is_windows = sys.platform == "win32"
        bin_dir = Path(project_path) / "node_modules" / ".bin"
        local_newman = None
        candidates = ("newman.cmd", "newman.ps1", "newman") if is_windows else ("newman",)
        for c in candidates:
            p = bin_dir / c
            if p.exists():
                local_newman = p
                break

        if local_newman:
            base_cmd = [str(local_newman), "run"]
        else:
            newman_bin = shutil.which("newman")
            if newman_bin:
                base_cmd = [newman_bin, "run"]
            else:
                npx_cmd = shutil.which("npx") or ("npx.cmd" if is_windows else "npx")
                base_cmd = [npx_cmd, "--yes", "newman", "run"]

        # Target file
        target_file = None
        if mode == "specific_tests" and selected_tests:
            target_file = str(selected_tests[0])
        else:
            # Find first collection in directory
            for root, _, files in os.walk(project_path):
                for f in files:
                    if f.endswith(".json") and ("collection" in f.lower() or "postman" in f.lower()):
                        target_file = os.path.join(root, f)
                        break
                if target_file:
                    break

        if not target_file:
            return {
                "status": "error",
                "duration": 0.0,
                "total_tests": 0,
                "passed_tests": 0,
                "failed_tests": 0,
                "skipped_tests": 0,
                "report_path": None,
                "log_output": "Nenhuma coleção Postman (*.json) encontrada no diretório do projeto.",
            }

        cmd = list(base_cmd)
        cmd.append(target_file)

        # Folder tag filter
        if mode == "by_tag" and tags:
            cmd.extend(["--folder", tags])

        # Environment variables
        if env_vars:
            for k, v in env_vars.items():
                cmd.extend(["--env-var", f"{k}={v}"])

        env = os.environ.copy()

        try:
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=project_path,
                env=env,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
        except Exception as e:
            duration = (datetime.utcnow() - start_time).total_seconds()
            error_msg = f"Failed to start Newman process: {e}"
            log_lines.append(error_msg)
            if on_output:
                try:
                    res = on_output(error_msg)
                    if asyncio.iscoroutine(res):
                        await res
                except Exception:
                    pass

            return {
                "status": "error",
                "duration": round(duration, 2),
                "total_tests": 0,
                "passed_tests": 0,
                "failed_tests": 0,
                "skipped_tests": 0,
                "report_path": None,
                "log_output": error_msg,
            }

        try:
            while self.process and self.process.stdout:
                line_bytes = await self.process.stdout.readline()
                if not line_bytes:
                    break
                line = line_bytes.decode("utf-8", errors="replace").rstrip("\r\n")
                log_lines.append(line)
                if on_output:
                    try:
                        res = on_output(line)
                        if asyncio.iscoroutine(res):
                            await res
                    except Exception:
                        pass
        except asyncio.CancelledError:
            self.cancel()

        if self.process:
            try:
                await self.process.wait()
            except Exception:
                pass

        duration = (datetime.utcnow() - start_time).total_seconds()
        full_log = "\n".join(log_lines)
        total, passed, failed, skipped = self._parse_results_from_log(full_log)

        if self.is_cancelled:
            final_status = "cancelled"
        elif self.process and self.process.returncode == 0:
            final_status = "passed"
        else:
            final_status = "failed" if failed > 0 else "error"

        return {
            "status": final_status,
            "duration": round(duration, 2),
            "total_tests": total,
            "passed_tests": passed,
            "failed_tests": failed,
            "skipped_tests": skipped,
            "report_path": None,
            "log_output": full_log,
        }
