import asyncio
from pathlib import Path
import re
import sys
import traceback
from threading import Event, Lock, Thread
from uuid import uuid4

_automation_jobs = {}
_automation_jobs_lock = Lock()


def _prepare_playwright_event_loop() -> None:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


def _run_statement_download_flow(job_id: str, target_url: str, download_dir: str, continue_event: Event) -> None:
    """Open the bank site, wait for manual login, then download statements.

    This deliberately does not automate credentials or MFA. The user logs in
    manually, then resumes Playwright so the post-login statement steps can run.
    """

    try:
        _prepare_playwright_event_loop()

        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel= "chrome",
                                                 headless=False, 
                                                 slow_mo=250)
            context = browser.new_context(
                accept_downloads=True,
                viewport={"width": 1440, "height": 1000},
            )
            page = context.new_page()
            page.goto(target_url, wait_until="domcontentloaded")

            # TODO: Log in to CIBC manually in the browser window, including any MFA.
            # Then return to the main app and click "Continue after login".
            continue_event.wait()

            # TODO: Inspect the logged-in CIBC page and replace these placeholder
            # roles/names with the real navigation element for the account or
            # statements area. Prefer get_by_role/get_by_text over brittle CSS
            # classes when possible.
            
            # Click on Download Transactions
            download_transactions_link = page.locator('a[data-test-id="olb-download-transactions"]')
            download_transactions_link.wait_for(timeout=30000)
            download_transactions_link.click()

            # Click accounts dropdown
            account_dropdown = page.locator("ui-select select").nth(0)
            account_dropdown.wait_for(timeout=30000)
            account_dropdown.click()
            # Select CIBC VISA option
            visa_option_value = account_dropdown.locator("option", has_text="CIBC VISA").get_attribute("value")
            if not visa_option_value:
                raise RuntimeError("Could not find a CIBC VISA option in the account selector.")
            account_dropdown.select_option(value=visa_option_value)

            #Download all since last download
            last_download_radio = page.locator('input[type="radio"][name="criteria"][value="LAST_DOWNLOAD"]')
            last_download_radio.wait_for(timeout=30000)
            last_download_radio.check()

            #Click download button
            download_button = page.locator('ui-button[role="button"]', has_text="Download Transactions")
            download_button.wait_for(timeout=30000)
            download_button.click()


            # Click accounts dropdown
            account_dropdown = page.locator("ui-select select").nth(0)
            account_dropdown.wait_for(timeout=30000)
            account_dropdown.click()
            # Select Chequing option
            chequing_option_value = account_dropdown.locator("option", has_text=re.compile(r"^\s*Chequing")).get_attribute("value")
            if not chequing_option_value:
                raise RuntimeError("Could not find a Chequing option in the account selector.")
            account_dropdown.select_option(value=chequing_option_value)

            #Click download button
            download_button = page.locator('ui-button[role="button"]', has_text="Download Transactions")
            download_button.wait_for(timeout=30000)
            download_button.click()

    except Exception as exc:
        print(f"Statement download flow failed: {exc}")
        print(traceback.format_exc())
    finally:
        with _automation_jobs_lock:
            _automation_jobs.pop(job_id, None)


def start_download_flow(target_url: str = "https://www.cibc.com/en/personal-banking.html", download_dir: str = "storage/downloads") -> dict:
    """Start the browser automation flow for statement downloads.

    The flow opens the user's browser and keeps login/download steps manual.
    Browser launch issues are returned as structured blocked responses so the
    UI can show a useful message instead of failing.
    """

    Path(download_dir).mkdir(parents=True, exist_ok=True)

    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
    except ImportError as exc:
        return {
            "job_id": str(uuid4()),
            "status": "blocked",
            "message": "Install Playwright first with 'pip install playwright' and 'playwright install chromium'.",
            "target_url": target_url,
            "download_dir": download_dir,
            "error": str(exc),
        }

    try:
        job_id = str(uuid4())
        continue_event = Event()
        thread = Thread(target=_run_statement_download_flow, args=(job_id, target_url, download_dir, continue_event), daemon=True)
        with _automation_jobs_lock:
            _automation_jobs[job_id] = {
                "continue_event": continue_event,
                "target_url": target_url,
                "download_dir": download_dir,
            }
        thread.start()
    except Exception as exc:
        return {
            "job_id": str(uuid4()),
            "status": "blocked",
            "message": f"Automation could not start: {exc}",
            "target_url": target_url,
            "download_dir": download_dir,
            "error": str(exc),
        }

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Browser automation started. Log in manually, then return here and click Continue after login.",
        "target_url": target_url,
        "download_dir": download_dir,
    }


def continue_download_flow(job_id: str) -> dict:
    with _automation_jobs_lock:
        job = _automation_jobs.get(job_id)

    if not job:
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
        "target_url": job["target_url"],
        "download_dir": job["download_dir"],
    }
