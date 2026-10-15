"""Playwright test runner service."""

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


def _extract_last_count(pattern: str, text: str) -> int:
    """Find the last integer count matching regex pattern in text."""
    matches = re.findall(pattern, text, re.IGNORECASE)
    if matches:
        return int(matches[-1])
    return 0


class PlaywrightRunner:
    """Runner for executing Playwright test suites."""

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
        Parse test results from Playwright console output using regular expressions.
        Returns: (total_tests, passed_tests, failed_tests, skipped_tests)
        """
        clean_text = _strip_ansi(log_text)

        passed = _extract_last_count(r"(\d+)\s+passed", clean_text)
        failed = _extract_last_count(r"(\d+)\s+failed", clean_text)
        skipped = _extract_last_count(r"(\d+)\s+skipped", clean_text)
        did_not_run = _extract_last_count(r"(\d+)\s+did not run", clean_text)
        flaky = _extract_last_count(r"(\d+)\s+flaky", clean_text)

        total_skipped = skipped + did_not_run
        total_passed = passed + flaky
        total = total_passed + failed + total_skipped

        return total, total_passed, failed, total_skipped

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
        """
        Execute Playwright test suite using npx playwright test.

        Returns:
            dict containing:
                - status: 'passed' | 'failed' | 'error' | 'cancelled'
                - duration: execution duration in seconds
                - total_tests: total test count
                - passed_tests: passed test count
                - failed_tests: failed test count
                - skipped_tests: skipped test count
                - report_path: path to html report or None
                - log_output: full console output
        """
        self.is_cancelled = False
        start_time = datetime.utcnow()
        log_lines: list[str] = []

        # Prepare output directory
        if not output_dir:
            output_dir = os.path.join(project_path, "reports", "playwright")
        output_path = Path(output_dir).resolve()
        output_path.mkdir(parents=True, exist_ok=True)

        # Detect local playwright binary in node_modules, fall back to npx
        is_windows = sys.platform == "win32"
        bin_dir = Path(project_path) / "node_modules" / ".bin"
        local_pw = None
        candidates = ("playwright.cmd", "playwright.ps1", "playwright") if is_windows else ("playwright",)
        for c in candidates:
            p = bin_dir / c
            if p.exists():
                local_pw = p
                break

        if local_pw:
            cmd: list[str] = [str(local_pw), "test", "--reporter=list"]
        else:
            # Use npx --yes to auto-install without interactive prompt
            npx_cmd = shutil.which("npx") or ("npx.cmd" if is_windows else "npx")
            cmd = [npx_cmd, "--yes", "playwright", "test", "--reporter=list"]

        # IMPORTANT: Test file filters must come right after 'test' command,
        # before --project and other flags, otherwise Playwright interprets
        # file paths as project names.
        if mode == "specific_tests" and selected_tests:
            for test in selected_tests:
                test_str = str(test).strip()
                if test_str:
                    cmd.append(test_str)

        if output_dir:
            cmd.append(f"--output={output_path}")

        if browser:
            cmd.extend(["--project", browser])

        if debug:
            cmd.append("--debug")

        if mode == "by_tag" and tags:
            cmd.extend(["--grep", tags])

        # Environment setup
        env = os.environ.copy()

        # Handle headless / headed mode
        if not headless:
            cmd.append("--headed")
            env.pop("CI", None)
            env["HEADED"] = "1"
            if not is_windows:
                if "DISPLAY" not in env:
                    env["DISPLAY"] = os.environ.get("DISPLAY", ":0")
                if "XAUTHORITY" not in env and os.environ.get("XAUTHORITY"):
                    env["XAUTHORITY"] = os.environ.get("XAUTHORITY")
        else:
            cmd.append("--headless")
            env["CI"] = "1"

        if debug:
            env["PWDEBUG"] = "1"

        # Direct Playwright HTML reporter output into output_dir/report if html reporter used
        html_report_dir = output_path / "report"
        env["PLAYWRIGHT_HTML_REPORT"] = str(html_report_dir)

        if env_vars:
            env.update({str(k): str(v) for k, v in env_vars.items()})

        # Launch process with project_path as cwd
        # stdin=DEVNULL prevents interactive prompts from blocking
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
            error_msg = f"Failed to start playwright process: {e}"
            log_lines.append(error_msg)
            if on_output:
                try:
                    if asyncio.iscoroutinefunction(on_output):
                        await on_output(error_msg)
                    else:
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
                "total": 0,
                "passed": 0,
                "failed": 0,
                "skipped": 0,
                "report_path": None,
                "log_output": error_msg,
                "log": error_msg,
            }

        # Stream stdout line-by-line
        while self.process and self.process.stdout:
            line_bytes = await self.process.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace").rstrip("\r\n")
            log_lines.append(line)

            if on_output:
                try:
                    if asyncio.iscoroutinefunction(on_output):
                        await on_output(line)
                    else:
                        res = on_output(line)
                        if asyncio.iscoroutine(res):
                            await res
                except Exception:
                    pass

        if self.process:
            await self.process.wait()

        end_time = datetime.utcnow()
        duration = (end_time - start_time).total_seconds()
        full_log = "\n".join(log_lines)

        # Parse test results
        total_tests, passed_tests, failed_tests, skipped_tests = self._parse_results_from_log(full_log)

        # Locate HTML report
        report_path_str: Optional[str] = None
        html_report_file = html_report_dir / "index.html"
        alt_html_file = output_path / "index.html"
        if html_report_file.exists():
            report_path_str = str(html_report_file)
        elif alt_html_file.exists():
            report_path_str = str(alt_html_file)

        # Determine execution status
        if self.is_cancelled:
            status = "cancelled"
        elif failed_tests > 0:
            status = "failed"
        elif total_tests > 0 and failed_tests == 0:
            status = "passed"
        elif self.process and self.process.returncode == 0:
            status = "passed"
        elif self.process and self.process.returncode == 1:
            status = "failed"
        else:
            status = "error" if (self.process and self.process.returncode not in (0, 1)) else "passed"

        return {
            "status": status,
            "duration": round(duration, 2),
            "total_tests": total_tests,
            "passed_tests": passed_tests,
            "failed_tests": failed_tests,
            "skipped_tests": skipped_tests,
            "total": total_tests,
            "passed": passed_tests,
            "failed": failed_tests,
            "skipped": skipped_tests,
            "report_path": report_path_str,
            "log_output": full_log,
            "log": full_log,
        }
