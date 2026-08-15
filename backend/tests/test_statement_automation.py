import unittest
from unittest.mock import Mock, patch

from app.services import statement_automation


class StatementAutomationTests(unittest.TestCase):
    def test_open_in_chrome_uses_regular_profile(self):
        with patch.object(statement_automation, "_chrome_executable_path", return_value="chrome.exe"):
            with patch.object(statement_automation, "_chrome_user_data_dir", return_value="User Data"):
                with patch.object(statement_automation, "_chrome_profile_directory", return_value="Default"):
                    with patch.object(statement_automation.subprocess, "Popen") as popen:
                        statement_automation._open_in_chrome("http://localhost:5173")

        popen.assert_called_once_with(
            [
                "chrome.exe",
                "--user-data-dir=User Data",
                "--profile-directory=Default",
                "http://localhost:5173",
            ],
            close_fds=True,
        )

    def test_opens_simplii_in_chrome(self):
        with patch.object(statement_automation, "_open_in_chrome") as open_in_chrome:
            result = statement_automation.start_download_flow()

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["accounts"], [])
        self.assertIn("Simplii", result["message"])
        open_in_chrome.assert_called_once_with(statement_automation.SIMPLII_LOGIN_URL)

    def test_returns_blocked_status_when_simplii_cannot_open(self):
        with patch.object(statement_automation, "_open_in_chrome", side_effect=RuntimeError("profile locked")):
            result = statement_automation.start_download_flow()

        self.assertEqual(result["status"], "blocked")
        self.assertIn("profile locked", result["message"])
        self.assertEqual(result["accounts"], [])

    def test_returns_simplii_launch_profile(self):
        result = statement_automation.available_download_profiles()

        self.assertEqual(result["banks"], [
            {
                "id": "simplii",
                "name": "Simplii Financial",
                "accounts": [],
            }
        ])

    def test_continue_download_flow_is_noop(self):
        result = statement_automation.continue_download_flow("job-1")

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["accounts"], [])

    def test_prepares_proactor_event_loop_on_windows(self):
        policy = Mock()

        with patch.object(statement_automation.sys, "platform", "win32"):
            with patch.object(statement_automation.asyncio, "WindowsProactorEventLoopPolicy", return_value=policy):
                with patch.object(statement_automation.asyncio, "set_event_loop_policy") as set_event_loop_policy:
                    statement_automation._prepare_playwright_event_loop()

        set_event_loop_policy.assert_called_once_with(policy)


if __name__ == "__main__":
    unittest.main()
