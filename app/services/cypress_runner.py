"""Cypress test runner service."""

import asyncio
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


class CypressRunner:
    """Runner for executing Cypress test suites."""

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
        """
        Parse test results from Cypress console output.
        Returns: (total_tests, passed_tests, failed_tests, skipped_tests)
        """
        clean_text = _strip_ansi(log_text)

        # Cypress outputs summary table:
        # Tests:        5
        # Passing:      4
        # Failing:      1
        # Pending:      0
        # Skipped:      0
        tests_matches = re.findall(r"Tests:\s+(\d+)", clean_text)
        passing_matches = re.findall(r"Passing:\s+(\d+)", clean_text)
        failing_matches = re.findall(r"Failing:\s+(\d+)", clean_text)
        pending_matches = re.findall(r"Pending:\s+(\d+)", clean_text)
        skipped_matches = re.findall(r"Skipped:\s+(\d+)", clean_text)

        total = int(tests_matches[-1]) if tests_matches else 0
        passed = int(passing_matches[-1]) if passing_matches else 0
        failed = int(failing_matches[-1]) if failing_matches else 0
        pending = int(pending_matches[-1]) if pending_matches else 0
        skipped = int(skipped_matches[-1]) if skipped_matches else 0

        total_skipped = pending + skipped
        if total == 0:
            total = passed + failed + total_skipped

        return total, passed, failed, total_skipped

    async def run(
        self,
        project_path: str,
        mode: str = "full_suite",
        headless: bool = True,
        debug: bool = False,
        browser: str = "chrome",
        selected_tests: Optional[list[str]] = None,
        tags: Optional[str] = None,
        env_vars: Optional[dict[str, Any]] = None,
        output_dir: Optional[str] = None,
        on_output: Optional[Callable[[str], Any]] = None,
    ) -> dict[str, Any]:
        """
        Execute Cypress test suite using npx cypress run.
        """
        self.is_cancelled = False
        start_time = datetime.utcnow()
        log_lines: list[str] = []

        if not output_dir:
            output_dir = os.path.join(project_path, "reports", "cypress")
        output_path = Path(output_dir).resolve()
        output_path.mkdir(parents=True, exist_ok=True)

        is_windows = sys.platform == "win32"
        bin_dir = Path(project_path) / "node_modules" / ".bin"
        local_cy = None
        candidates = ("cypress.cmd", "cypress.ps1", "cypress") if is_windows else ("cypress",)
        for c in candidates:
            p = bin_dir / c
            if p.exists():
                local_cy = p
                break

        if local_cy:
            cmd: list[str] = [str(local_cy), "run"]
        else:
            npx_cmd = shutil.which("npx") or ("npx.cmd" if is_windows else "npx")
            cmd = [npx_cmd, "--yes", "cypress", "run"]

        # Browser
        if browser:
            # Map chromium to chrome for Cypress if needed
            cy_browser = "chrome" if browser.lower() == "chromium" else browser.lower()
            cmd.extend(["--browser", cy_browser])

        env = os.environ.copy()
        # Headless / Headed
        if not headless:
            cmd.append("--headed")
            env.pop("CI", None)
            if not is_windows:
                if "DISPLAY" not in env:
                    env["DISPLAY"] = os.environ.get("DISPLAY", ":0")
                if "XAUTHORITY" not in env and os.environ.get("XAUTHORITY"):
                    env["XAUTHORITY"] = os.environ.get("XAUTHORITY")
        else:
            cmd.append("--headless")
            env["CI"] = "1"

        # Specific tests
        if mode == "specific_tests" and selected_tests:
            spec_arg = ",".join(str(t).strip() for t in selected_tests if str(t).strip())
            if spec_arg:
                cmd.extend(["--spec", spec_arg])

        # Tags or grep
        if mode == "by_tag" and tags:
            cmd.extend(["--env", f"grep={tags}"])

        if env_vars:
            env.update({str(k): str(v) for k, v in env_vars.items()})

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
            error_msg = f"Failed to start Cypress process: {e}"
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

        # Stream stdout line by line
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
        elif failed > 0 or (self.process and self.process.returncode != 0):
            final_status = "failed"
        else:
            final_status = "passed" if total > 0 else "error"

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
