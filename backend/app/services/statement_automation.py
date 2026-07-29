import asyncio
from dataclasses import dataclass
from pathlib import Path
import re
import sys
import traceback
from threading import Event, Lock, Thread
from typing import Any
from uuid import uuid4

_automation_jobs: dict[str, dict[str, Any]] = {}
_automation_jobs_lock = Lock()


@dataclass(frozen=True)
class AutomationAccount:
    id: str
    label: str
    match_text: str
    match_type: str = "text"
    range: str = "last_download"


@dataclass(frozen=True)
class BankProfile:
    id: str
    name: str
    target_url: str
    accounts: tuple[AutomationAccount, ...]


BANK_PROFILES: dict[str, BankProfile] = {
    "cibc": BankProfile(
        id="cibc",
        name="CIBC",
        target_url="https://www.cibc.com/en/personal-banking.html",
        accounts=(
            AutomationAccount(
                id="cibc-visa",
                label="CIBC Visa",
                match_text="CIBC VISA",
            ),
            AutomationAccount(
                id="cibc-chequing",
                label="Chequing",
                match_text=r"^\s*Chequing",
                match_type="regex",
            ),
        ),
    ),
    "simplii": BankProfile(
        id="simplii",
        name="Simplii Financial",
        target_url="https://online.simplii.com/ebm-resources/public/simplii/online-banking/client/index.html",
        accounts=(
            AutomationAccount(
                id="simplii-chequing",
                label="Simplii Chequing",
                match_text=r"^\s*(Simplii\s+)?(No Fee\s+)?Chequing",
                match_type="regex",
            ),
            AutomationAccount(
                id="simplii-savings",
                label="Simplii Savings",
                match_text=r"^\s*(Simplii\s+)?(High Interest\s+)?Savings",
                match_type="regex",
            ),
            AutomationAccount(
                id="simplii-visa",
                label="Simplii Visa",
                match_text=r"^\s*(Simplii\s+)?(Cash Back\s+)?Visa",
                match_type="regex",
            ),
        ),
    ),
}


def available_download_profiles() -> dict:
    return {
        "banks": [
            {
                "id": profile.id,
                "name": profile.name,
                "accounts": [
                    {
                        "id": account.id,
                        "label": account.label,
                        "range": account.range,
                    }
                    for account in profile.accounts
                ],
            }
            for profile in BANK_PROFILES.values()
        ]
    }


def _prepare_playwright_event_loop() -> None:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


def _status_item(account: AutomationAccount, status: str, message: str = "") -> dict:
    return {
        "account_id": account.id,
        "account_label": account.label,
        "status": status,
        "message": message,
    }


def _set_job_status(job_id: str, status: str, message: str, accounts: list[dict] | None = None) -> None:
    with _automation_jobs_lock:
        job = _automation_jobs.get(job_id)
        if not job:
            return
        job["status"] = status
        job["message"] = message
        if accounts is not None:
            job["accounts"] = accounts


def _account_option_locator(account_dropdown: Any, account: AutomationAccount) -> Any:
    if account.match_type == "regex":
        return account_dropdown.locator("option", has_text=re.compile(account.match_text))
    return account_dropdown.locator("option", has_text=account.match_text)


def _download_cibc_account(page: Any, account: AutomationAccount) -> None:
    account_dropdown = page.locator("ui-select select").nth(0)
    account_dropdown.wait_for(timeout=30000)
    account_dropdown.click()

    option_value = _account_option_locator(account_dropdown, account).get_attribute("value")
    if not option_value:
        raise RuntimeError(f"Could not find {account.label} in the account selector.")
    account_dropdown.select_option(value=option_value)

    if account.range == "last_download":
        last_download_radio = page.locator('input[type="radio"][name="criteria"][value="LAST_DOWNLOAD"]')
        last_download_radio.wait_for(timeout=30000)
        last_download_radio.check()

    download_button = page.locator('ui-button[role="button"]', has_text="Download Transactions")
    download_button.wait_for(timeout=30000)
    download_button.click()


def _run_cibc_style_downloads(page: Any, accounts: list[AutomationAccount], job_id: str, bank_name: str) -> None:
    download_transactions_link = page.locator('a[data-test-id="olb-download-transactions"]')
    download_transactions_link.wait_for(timeout=30000)
    download_transactions_link.click()

    account_statuses = [_status_item(account, "queued") for account in accounts]
    _set_job_status(job_id, "running", f"Downloading selected {bank_name} accounts.", account_statuses)

    for index, account in enumerate(accounts):
        account_statuses[index] = _status_item(account, "running", "Download in progress.")
        _set_job_status(job_id, "running", f"Downloading {account.label}.", account_statuses)
        try:
            _download_cibc_account(page, account)
        except Exception as exc:
            account_statuses[index] = _status_item(account, "failed", str(exc))
            _set_job_status(job_id, "running", f"{account.label} could not be downloaded.", account_statuses)
            continue
        account_statuses[index] = _status_item(account, "downloaded", "Download requested.")
        _set_job_status(job_id, "running", f"Downloaded {account.label}.", account_statuses)


def _run_cibc_downloads(page: Any, accounts: list[AutomationAccount], job_id: str) -> None:
    _run_cibc_style_downloads(page, accounts, job_id, "CIBC")


def _run_simplii_downloads(page: Any, accounts: list[AutomationAccount], job_id: str) -> None:
    _run_cibc_style_downloads(page, accounts, job_id, "Simplii Financial")


BANK_ADAPTERS = {
    "cibc": _run_cibc_downloads,
    "simplii": _run_simplii_downloads,
}


def _run_statement_download_flow(
    job_id: str,
    bank_jobs: list[tuple[BankProfile, list[AutomationAccount]]],
    download_dir: str,
    continue_event: Event,
) -> None:
    """Open each bank site, wait for manual login, then download selected accounts."""

    try:
        _prepare_playwright_event_loop()

        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                user_data_dir="storage/browser-profile",
                channel="chrome",
                headless=False,
                slow_mo=250,
                args=["--start-maximized"],
                accept_downloads=True,
                no_viewport=True,
            )

            for profile, accounts in bank_jobs:
                page = context.new_page()
                _set_job_status(job_id, "waiting_for_login", f"Log in to {profile.name}, then continue.")
                page.goto(profile.target_url, wait_until="domcontentloaded")
                continue_event.wait()
                continue_event.clear()

                adapter = BANK_ADAPTERS.get(profile.id)
                if not adapter:
                    raise RuntimeError(f"No automation adapter is configured for {profile.name}.")
                adapter(page, accounts, job_id)

            _set_job_status(job_id, "completed", "Selected account downloads have been requested.")
    except Exception as exc:
        print(f"Statement download flow failed: {exc}")
        print(traceback.format_exc())
        _set_job_status(job_id, "failed", str(exc))
    finally:
        with _automation_jobs_lock:
            job = _automation_jobs.get(job_id)
            if job:
                job["continue_event"] = None


def _resolve_bank_jobs(requested_banks: list[dict] | None) -> list[tuple[BankProfile, list[AutomationAccount]]]:
    if not requested_banks:
        requested_banks = [
            {
                "bank_id": "cibc",
                "account_ids": [account.id for account in BANK_PROFILES["cibc"].accounts],
            }
        ]

    bank_jobs: list[tuple[BankProfile, list[AutomationAccount]]] = []
    for requested_bank in requested_banks:
        bank_id = str(requested_bank.get("bank_id", "")).strip()
        profile = BANK_PROFILES.get(bank_id)
        if not profile:
            raise ValueError(f"{bank_id or 'Selected bank'} is not configured for browser downloads.")

        account_lookup = {account.id: account for account in profile.accounts}
        requested_account_ids = requested_bank.get("account_ids") or []
        accounts = [
            account_lookup[account_id]
            for account_id in requested_account_ids
            if account_id in account_lookup
        ]
        if not accounts:
            raise ValueError(f"Select at least one {profile.name} account to download.")
        bank_jobs.append((profile, accounts))

    return bank_jobs


def start_download_flow(
    requested_banks: list[dict] | None = None,
    download_dir: str = "storage/downloads",
) -> dict:
    Path(download_dir).mkdir(parents=True, exist_ok=True)

    try:
        bank_jobs = _resolve_bank_jobs(requested_banks)
    except ValueError as exc:
        return {
            "job_id": str(uuid4()),
            "status": "blocked",
            "message": str(exc),
            "download_dir": download_dir,
        }

    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
    except ImportError as exc:
        return {
            "job_id": str(uuid4()),
            "status": "blocked",
            "message": "Install Playwright first with 'pip install playwright' and 'playwright install chromium'.",
            "download_dir": download_dir,
            "error": str(exc),
        }

    try:
        job_id = str(uuid4())
        continue_event = Event()
        account_statuses = [
            _status_item(account, "queued")
            for _, accounts in bank_jobs
            for account in accounts
        ]
        thread = Thread(
            target=_run_statement_download_flow,
            args=(job_id, bank_jobs, download_dir, continue_event),
            daemon=True,
        )
        with _automation_jobs_lock:
            _automation_jobs[job_id] = {
                "continue_event": continue_event,
                "status": "queued",
                "message": "Browser automation started.",
                "download_dir": download_dir,
                "accounts": account_statuses,
            }
        thread.start()
    except Exception as exc:
        return {
            "job_id": str(uuid4()),
            "status": "blocked",
            "message": f"Automation could not start: {exc}",
            "download_dir": download_dir,
            "error": str(exc),
        }

    bank_names = ", ".join(profile.name for profile, _ in bank_jobs)
    return {
        "job_id": job_id,
        "status": "queued",
        "message": f"Browser automation started for {bank_names}. Log in manually, then return here and click Continue after login.",
        "download_dir": download_dir,
        "accounts": account_statuses,
    }


def get_download_flow(job_id: str) -> dict:
    with _automation_jobs_lock:
        job = _automation_jobs.get(job_id)
        if not job:
            return {
                "job_id": job_id,
                "status": "not_found",
                "message": "No active automation flow was found.",
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
    with _automation_jobs_lock:
        job = _automation_jobs.get(job_id)

    if not job or not job.get("continue_event"):
        return {
            "job_id": job_id,
            "status": "not_found",
            "message": "No waiting automation flow was found. Start a new download flow first.",
        }

    job["continue_event"].set()
    return {
        "job_id": job_id,
        "status": "continuing",
        "message": "Continuing statement download automation.",
        "download_dir": job["download_dir"],
        "accounts": job.get("accounts", []),
    }
