import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from app.services import statement_automation


class StatementAutomationTests(unittest.TestCase):
    def test_queues_browser_launch(self):
        thread = Mock()

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.object(statement_automation, "Thread", return_value=thread) as thread_factory:
                result = statement_automation.start_download_flow(
                    download_dir=str(Path(tmpdir) / "downloads"),
                )

        self.assertEqual(result["status"], "queued")
        self.assertEqual(result["download_dir"], str(Path(tmpdir) / "downloads"))
        self.assertEqual([account["account_id"] for account in result["accounts"]], ["cibc-visa", "cibc-chequing"])
        self.assertIn("Browser automation started", result["message"])
        thread_factory.assert_called_once()
        _, kwargs = thread_factory.call_args
        self.assertEqual(kwargs["target"], statement_automation._run_statement_download_flow)
        self.assertEqual(kwargs["args"][0], result["job_id"])
        self.assertEqual(kwargs["args"][1][0][0].id, "cibc")
        self.assertEqual(kwargs["args"][2], str(Path(tmpdir) / "downloads"))
        self.assertFalse(kwargs["args"][3].is_set())
        self.assertTrue(kwargs["daemon"])
        thread.start.assert_called_once_with()

    def test_returns_blocked_status_when_browser_launch_cannot_start(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.object(statement_automation, "Thread", side_effect=RuntimeError("thread failed")):
                result = statement_automation.start_download_flow(
                    download_dir=str(Path(tmpdir) / "downloads"),
                )

        self.assertEqual(result["status"], "blocked")
        self.assertIn("thread failed", result["message"])
        self.assertEqual(result["download_dir"], str(Path(tmpdir) / "downloads"))

    def test_returns_download_profiles(self):
        result = statement_automation.available_download_profiles()

        self.assertEqual(result["banks"][0]["id"], "cibc")
        self.assertEqual(result["banks"][0]["accounts"][0]["id"], "cibc-visa")
        simplii_profile = next(bank for bank in result["banks"] if bank["id"] == "simplii")
        self.assertEqual(
            [account["id"] for account in simplii_profile["accounts"]],
            ["simplii-chequing", "simplii-savings", "simplii-visa"],
        )

    def test_continue_download_flow_signals_waiting_job(self):
        continue_event = Mock()

        with statement_automation._automation_jobs_lock:
            statement_automation._automation_jobs["job-1"] = {
                "continue_event": continue_event,
                "status": "waiting_for_login",
                "message": "Waiting",
                "download_dir": "downloads",
                "accounts": [],
            }

        result = statement_automation.continue_download_flow("job-1")

        self.assertEqual(result["status"], "continuing")
        continue_event.set.assert_called_once_with()

        with statement_automation._automation_jobs_lock:
            statement_automation._automation_jobs.pop("job-1", None)

    def test_continue_download_flow_handles_missing_job(self):
        result = statement_automation.continue_download_flow("missing")

        self.assertEqual(result["status"], "not_found")

    def test_prepares_proactor_event_loop_on_windows(self):
        policy = Mock()

        with patch.object(statement_automation.sys, "platform", "win32"):
            with patch.object(statement_automation.asyncio, "WindowsProactorEventLoopPolicy", return_value=policy):
                with patch.object(statement_automation.asyncio, "set_event_loop_policy") as set_event_loop_policy:
                    statement_automation._prepare_playwright_event_loop()

        set_event_loop_policy.assert_called_once_with(policy)


if __name__ == "__main__":
    unittest.main()
