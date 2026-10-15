"""Test discovery service."""

import asyncio
import os
from pathlib import Path
from app.schemas import TestFile

# Directories to skip when scanning for test files
IGNORED_DIRS = {
    "node_modules",
    "__pycache__",
    ".git",
    "venv",
    ".venv",
    ".tox",
    ".pytest_cache",
    ".cache",
    "dist",
    "build",
}

# Playwright test file suffixes
PLAYWRIGHT_SUFFIXES = (
    ".spec.ts",
    ".spec.js",
    ".test.ts",
    ".test.js",
    ".spec.tsx",
    ".spec.jsx",
    ".test.tsx",
    ".test.jsx",
    ".spec.mjs",
    ".test.mjs",
    ".spec.cjs",
    ".test.cjs",
)


def _matches_pattern(filename: str, test_type: str) -> bool:
    """Check if filename matches test file pattern for the given test type."""
    type_normalized = test_type.strip().lower()
    lower_filename = filename.lower()

    if type_normalized == "robot":
        return lower_filename.endswith(".robot")

    if type_normalized == "playwright":
        return any(lower_filename.endswith(suffix) for suffix in PLAYWRIGHT_SUFFIXES)

    return False


def _scan_directory(project_path: str, test_type: str) -> list[TestFile]:
    """Synchronous file discovery inside project directory."""
    root_path = Path(project_path).resolve()
    if not root_path.exists() or not root_path.is_dir():
        return []

    discovered: list[TestFile] = []

    for dirpath, dirnames, filenames in os.walk(root_path):
        # Prune ignored directories in-place to avoid descending into them
        dirnames[:] = [
            d
            for d in dirnames
            if d not in IGNORED_DIRS and not d.startswith(".")
        ]

        for filename in filenames:
            if _matches_pattern(filename, test_type):
                full_path = Path(dirpath) / filename
                try:
                    rel_path = full_path.relative_to(root_path).as_posix()
                except ValueError:
                    rel_path = os.path.relpath(full_path, root_path).replace("\\", "/")

                discovered.append(
                    TestFile(
                        path=rel_path,
                        name=filename,
                        type=test_type,
                    )
                )

    discovered.sort(key=lambda t: t.path.lower())
    return discovered


async def discover_tests(project_path: str, test_type: str) -> list[TestFile]:
    """
    Scan project directory for test files.
    For robot: find all *.robot files recursively
    For playwright: find all *.spec.ts, *.spec.js, *.test.ts, *.test.js files recursively
    Return list of TestFile(path=relative_path, name=filename, type=test_type)
    Skip node_modules, __pycache__, .git, venv, .venv directories
    Sort results alphabetically by path
    """
    return await asyncio.to_thread(_scan_directory, project_path, test_type)
