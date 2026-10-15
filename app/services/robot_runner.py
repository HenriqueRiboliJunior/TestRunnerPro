"""Robot Framework test runner service."""

import asyncio
import os
import shutil
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional


class RobotRunner:
    """Runner for executing Robot Framework test suites."""

    def __init__(self) -> None:
        self.process: Optional[asyncio.subprocess.Process] = None
        self.is_cancelled: bool = False

    def _find_robot_executable(self, project_path: str) -> list[str]:
        """
        Find the correct robot executable.
        Search order:
        1. Project's own venv (venv/bin/robot or .venv/bin/robot)
        2. User's home venv (/home/user/venv/bin/robot)
        3. System PATH (shutil.which('robot'))
        4. Fallback: sys.executable -m robot
        """
        project_dir = Path(project_path)

        # 1. Check project venv
        for venv_name in ("venv", ".venv"):
            robot_bin = project_dir / venv_name / "bin" / "robot"
            if robot_bin.exists():
                return [str(robot_bin)]

        # 2. Check user's home venv
        home_venv_robot = Path.home() / "venv" / "bin" / "robot"
        if home_venv_robot.exists():
            return [str(home_venv_robot)]

        # 3. Check system PATH
        robot_path = shutil.which("robot")
        if robot_path:
            return [robot_path]

        # 4. Fallback to sys.executable -m robot
        return [sys.executable, "-m", "robot"]

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

    def _parse_output_xml(self, xml_path: Path) -> tuple[int, int, int, int]:
        """
        Parse Robot Framework output.xml for test counts.
        Returns: (total_tests, passed_tests, failed_tests, skipped_tests)
        """
        if not xml_path.exists():
            return 0, 0, 0, 0

        try:
            tree = ET.parse(xml_path)
            root = tree.getroot()

            # Attempt to extract from <statistics><total><stat ...>
            stat_elem = root.find(".//statistics/total/stat")
            if stat_elem is not None:
                passed = int(stat_elem.attrib.get("pass", 0))
                failed = int(stat_elem.attrib.get("fail", 0))
                skipped = int(stat_elem.attrib.get("skip", 0))
                total = passed + failed + skipped
                return total, passed, failed, skipped

            # Fallback: inspect individual <test> status elements
            tests = root.findall(".//test")
            passed = 0
            failed = 0
            skipped = 0
            for test in tests:
                status_elem = test.find("status")
                if status_elem is not None:
                    st = status_elem.attrib.get("status", "").upper()
                    if st == "PASS":
                        passed += 1
                    elif st == "FAIL":
                        failed += 1
                    elif st == "SKIP":
                        skipped += 1
            total = len(tests)
            return total, passed, failed, skipped
        except Exception:
            return 0, 0, 0, 0

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
        Execute Robot Framework test suite.

        Returns:
            dict containing:
                - status: 'passed' | 'failed' | 'error' | 'cancelled'
                - duration: execution duration in seconds
                - total_tests: total test count
                - passed_tests: passed test count
                - failed_tests: failed test count
                - skipped_tests: skipped test count
                - report_path: path to report.html or None
                - log_output: full console output
        """
        self.is_cancelled = False
        start_time = datetime.utcnow()
        log_lines: list[str] = []

        # Ensure output directory exists
        if not output_dir:
            output_dir = os.path.join(project_path, "reports", "robot")
        output_path = Path(output_dir).resolve()
        output_path.mkdir(parents=True, exist_ok=True)

        # Find the correct robot executable
        # Priority: project venv > user venv > system PATH
        robot_cmd = self._find_robot_executable(project_path)

        # Build robot command
        cmd: list[str] = [
            *robot_cmd,
            "--outputdir",
            str(output_path),
            "--consolecolors",
            "off",
        ]

        if headless:
            cmd.extend([
                "--variable",
                "HEADLESS:true",
                "--variable",
                f"BROWSER:headless{browser}",
            ])
        else:
            cmd.extend([
                "--variable",
                f"BROWSER:{browser}",
            ])

        if debug:
            cmd.extend(["--loglevel", "DEBUG:INFO"])

        if mode == "by_tag" and tags:
            cmd.extend(["--include", tags])

        if mode == "specific_tests" and selected_tests:
            for test in selected_tests:
                test_str = str(test).strip()
                if test_str:
                    cmd.append(test_str)
        else:
            cmd.append(".")

        # Setup environment variables
        env = os.environ.copy()
        if headless:
            env["HEADLESS"] = "true"
            env["BROWSER"] = f"headless{browser}"
        else:
            env["BROWSER"] = browser

        if env_vars:
            env.update({str(k): str(v) for k, v in env_vars.items()})

        # Launch process
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
            error_msg = f"Failed to start robot process: {e}"
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

        # Parse test results from output.xml
        xml_file = output_path / "output.xml"
        total_tests, passed_tests, failed_tests, skipped_tests = self._parse_output_xml(xml_file)

        # Locate report HTML
        report_file = output_path / "report.html"
        log_file = output_path / "log.html"
        report_path_str: Optional[str] = None
        if report_file.exists():
            report_path_str = str(report_file)
        elif log_file.exists():
            report_path_str = str(log_file)

        # Determine status
        if self.is_cancelled:
            status = "cancelled"
        elif self.process and self.process.returncode == 0:
            status = "passed"
        elif failed_tests > 0 or (self.process and self.process.returncode in (1, 250)):
            status = "failed"
        elif total_tests > 0 and passed_tests == total_tests:
            status = "passed"
        else:
            status = "error" if (self.process and self.process.returncode not in (0, 1, 250)) else "passed"

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
