"""K6 Performance & Load test runner service."""

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


class K6Runner:
    """Runner for executing K6 performance and load tests."""

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

    def _parse_results(self, summary_json: Path, log_text: str) -> tuple[int, int, int, int]:
        """Parse test checks and requests from k6 summary or console log."""
        if summary_json.exists():
            try:
                with open(summary_json, "r", encoding="utf-8") as f:
                    data = json.load(f)
                metrics = data.get("metrics", {})
                checks = metrics.get("checks", {}).get("values", {})
                passed = int(checks.get("passes", 0))
                failed = int(checks.get("fails", 0))
                total = passed + failed
                if total == 0:
                    http_reqs = metrics.get("http_reqs", {}).get("values", {}).get("count", 0)
                    req_failed = metrics.get("http_req_failed", {}).get("values", {}).get("passes", 0)
                    total = int(http_reqs)
                    failed = int(req_failed)
                    passed = max(0, total - failed)
                return total, passed, failed, 0
            except Exception:
                pass

        # Parse from log text
        clean = _strip_ansi(log_text)
        checks_match = re.search(r"checks\.*:\s*([\d\.]+)%\s*✓\s*(\d+)\s*✗\s*(\d+)", clean)
        if checks_match:
            passed = int(checks_match.group(2))
            failed = int(checks_match.group(3))
            return passed + failed, passed, failed, 0

        http_match = re.search(r"http_reqs\.*:\s*(\d+)", clean)
        if http_match:
            total_reqs = int(http_match.group(1))
            fail_match = re.search(r"http_req_failed\.*:\s*([\d\.]+)%\s*✓\s*(\d+)\s*✗\s*(\d+)", clean)
            fails = int(fail_match.group(2)) if fail_match else 0
            passes = max(0, total_reqs - fails)
            return total_reqs, passes, fails, 0

        return 1, 1, 0, 0

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
        """Execute k6 run."""
        self.is_cancelled = False
        start_time = datetime.utcnow()
        log_lines: list[str] = []

        if not output_dir:
            output_dir = os.path.join(project_path, "reports", "k6")
        output_path = Path(output_dir).resolve()
        output_path.mkdir(parents=True, exist_ok=True)

        k6_bin = shutil.which("k6")
        if not k6_bin:
            return {
                "status": "error",
                "duration": 0.0,
                "total_tests": 0,
                "passed_tests": 0,
                "failed_tests": 0,
                "skipped_tests": 0,
                "report_path": None,
                "log_output": "Executável 'k6' não encontrado no PATH. Instale o k6 (https://k6.io/docs/get-started/installation/).",
            }

        target_file = None
        if mode == "specific_tests" and selected_tests:
            target_file = str(selected_tests[0])
        else:
            for root, _, files in os.walk(project_path):
                for f in files:
                    if f.endswith(".js") or f.endswith(".ts"):
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
                "log_output": "Nenhum script K6 (*.js ou *.ts) encontrado no diretório do projeto.",
            }

        summary_file = output_path / "k6-summary.json"
        cmd = [k6_bin, "run", f"--summary-export={summary_file}", target_file]

        if env_vars:
            for k, v in env_vars.items():
                cmd.extend(["-e", f"{k}={v}"])

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
            error_msg = f"Failed to start K6 process: {e}"
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
        total, passed, failed, skipped = self._parse_results(summary_file, full_log)

        if self.is_cancelled:
            final_status = "cancelled"
        elif self.process and self.process.returncode == 0 and failed == 0:
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
            "report_path": str(summary_file.name) if summary_file.exists() else None,
            "log_output": full_log,
        }
