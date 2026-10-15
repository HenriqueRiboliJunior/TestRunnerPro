"""Pytest test runner service."""

import asyncio
import os
import re
import shutil
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional


def _strip_ansi(text: str) -> str:
    """Remove ANSI escape sequences from console text."""
    ansi_regex = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")
    return ansi_regex.sub("", text)


class PytestRunner:
    """Runner for executing Pytest test suites."""

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

    def _find_pytest_executable(self, project_path: str) -> list[str]:
        """Find pytest in project venv, home venv, system PATH or fallback."""
        project_dir = Path(project_path)
        is_windows = sys.platform == "win32"
        bin_dirs = ("Scripts", "bin") if is_windows else ("bin",)
        pytest_names = ("pytest.exe", "pytest.bat", "pytest") if is_windows else ("pytest",)

        # 1. Project venv
        for venv_name in ("venv", ".venv", "env"):
            for b_dir in bin_dirs:
                for p_name in pytest_names:
                    p_bin = project_dir / venv_name / b_dir / p_name
                    if p_bin.exists():
                        return [str(p_bin)]

        # 2. System PATH
        system_pytest = shutil.which("pytest")
        if system_pytest:
            return [system_pytest]

        # 3. Fallback to current Python interpreter
        return [sys.executable, "-m", "pytest"]

    def _parse_junit_xml(self, xml_path: Path) -> tuple[int, int, int, int]:
        """
        Parse JUnit XML report for test counts.
        Returns: (total_tests, passed_tests, failed_tests, skipped_tests)
        """
        if not xml_path.exists():
            return 0, 0, 0, 0

        try:
            tree = ET.parse(xml_path)
            root = tree.getroot()

            # Handle both <testsuite> root and <testsuites> wrapping multiple suites
            suites = [root] if root.tag == "testsuite" else root.findall("testsuite")
            total = 0
            failures = 0
            errors = 0
            skipped = 0

            for s in suites:
                total += int(s.attrib.get("tests", 0))
                failures += int(s.attrib.get("failures", 0))
                errors += int(s.attrib.get("errors", 0))
                skipped += int(s.attrib.get("skipped", 0))

            failed = failures + errors
            passed = max(0, total - failed - skipped)
            return total, passed, failed, skipped
        except Exception:
            return 0, 0, 0, 0

    def _parse_results_from_log(self, log_text: str) -> tuple[int, int, int, int]:
        """Fallback regex parser from console output."""
        clean = _strip_ansi(log_text)
        passed_m = re.findall(r"(\d+)\s+passed", clean)
        failed_m = re.findall(r"(\d+)\s+failed", clean)
        skipped_m = re.findall(r"(\d+)\s+skipped", clean)
        error_m = re.findall(r"(\d+)\s+error", clean)

        passed = int(passed_m[-1]) if passed_m else 0
        failed = int(failed_m[-1]) if failed_m else 0
        skipped = int(skipped_m[-1]) if skipped_m else 0
        errors = int(error_m[-1]) if error_m else 0
        total_failed = failed + errors
        total = passed + total_failed + skipped
        return total, passed, total_failed, skipped

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
        """Execute Pytest test suite."""
        self.is_cancelled = False
        start_time = datetime.utcnow()
        log_lines: list[str] = []

        if not output_dir:
            output_dir = os.path.join(project_path, "reports", "pytest")
        output_path = Path(output_dir).resolve()
        output_path.mkdir(parents=True, exist_ok=True)

        junit_xml = output_path / "junit.xml"
        cmd = self._find_pytest_executable(project_path)
        cmd.extend(["-v", f"--junitxml={junit_xml}"])

        # Filter mode
        if mode == "specific_tests" and selected_tests:
            for t in selected_tests:
                if str(t).strip():
                    cmd.append(str(t).strip())

        if mode == "by_tag" and tags:
            # -k for expression match or -m for markers
            cmd.extend(["-k", tags])

        env = os.environ.copy()
        if not headless:
            env["HEADED"] = "1"
        if debug:
            cmd.append("-s")  # Don't capture stdout in debug
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
            error_msg = f"Failed to start Pytest process: {e}"
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

        # Parse counts from JUnit XML first, fallback to console log
        total, passed, failed, skipped = self._parse_junit_xml(junit_xml)
        if total == 0:
            total, passed, failed, skipped = self._parse_results_from_log(full_log)

        if self.is_cancelled:
            final_status = "cancelled"
        elif self.process and self.process.returncode == 0:
            final_status = "passed"
        elif failed > 0 or (self.process and self.process.returncode not in (0, 5)):
            final_status = "failed"
        elif self.process and self.process.returncode == 5:
            # Pytest returncode 5 = no tests collected
            final_status = "passed" if total > 0 else "error"
        else:
            final_status = "passed"

        return {
            "status": final_status,
            "duration": round(duration, 2),
            "total_tests": total,
            "passed_tests": passed,
            "failed_tests": failed,
            "skipped_tests": skipped,
            "report_path": str(junit_xml.name) if junit_xml.exists() else None,
            "log_output": full_log,
        }
