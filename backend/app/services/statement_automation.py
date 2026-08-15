import asyncio
import os
from pathlib import Path
import subprocess
import sys
from typing import Any
from uuid import uuid4

_automation_jobs: dict[str, dict[str, Any]] = {}

SIMPLII_LOGIN_URL = "https://online.simplii.com/ebm-resources/public/simplii/online-banking/client/index.html"


def available_download_profiles() -> dict:
    return {
        "banks": [
            {
                "id": "simplii",
                "name": "Simplii Financial",
                "accounts": [],
            }
        ]
    }


def _prepare_playwright_event_loop() -> None:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


def _chrome_user_data_dir() -> str:
    configured_dir = os.environ.get("CHROME_USER_DATA_DIR")
    if configured_dir:
        return configured_dir
    return str(Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data")


def _chrome_profile_directory() -> str:
    return os.environ.get("CHROME_PROFILE_DIRECTORY", "Default")


def _chrome_executable_path() -> str:
    configured_path = os.environ.get("CHROME_EXECUTABLE_PATH")
    if configured_path:
        return configured_path

    candidates = [
        Path(os.environ.get("PROGRAMFILES", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return "chrome.exe"


def _open_in_chrome(url: str) -> None:
    command = [
        _chrome_executable_path(),
        f"--user-data-dir={_chrome_user_data_dir()}",
        f"--profile-directory={_chrome_profile_directory()}",
    ]
    command.append(url)
    subprocess.Popen(command, close_fds=True)


def start_download_flow(
    requested_banks: list[dict] | None = None,
    download_dir: str = "storage/downloads",
) -> dict:
    job_id = str(uuid4())

    try:
        _open_in_chrome(SIMPLII_LOGIN_URL)
    except Exception as exc:
        return {
            "job_id": job_id,
            "status": "blocked",
            "message": f"Simplii could not open in Chrome: {exc}",
            "download_dir": download_dir,
            "accounts": [],
            "error": str(exc),
        }

    _automation_jobs[job_id] = {
        "status": "completed",
        "message": "Opened Simplii in Chrome.",
        "download_dir": download_dir,
        "accounts": [],
    }

    return {
        "job_id": job_id,
        "status": "completed",
        "message": "Opened Simplii in Chrome.",
        "download_dir": download_dir,
        "accounts": [],
    }


def get_download_flow(job_id: str) -> dict:
    job = _automation_jobs.get(job_id)
    if not job:
        return {
            "job_id": job_id,
            "status": "not_found",
            "message": "No active browser flow was found.",
            "accounts": [],
        }
    return {
        "job_id": job_id,
        "status": job["status"],
        "message": job["message"],
        "download_dir": job["download_dir"],
        "accounts": job.get("accounts", []),
    }


def continue_download_flow(job_id: str) -> dict:
    return {
        "job_id": job_id,
        "status": "completed",
        "message": "No browser action is waiting. Simplii opens in Chrome immediately now.",
        "accounts": [],
    }
