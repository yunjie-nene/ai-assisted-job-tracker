"""Exercise release failure recovery and SSM result handling without AWS access."""

import contextlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


DEPLOY = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ssm_deploy", DEPLOY / "run-ssm-deploy.py")
SSM = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SSM)
SHA = "a" * 40
INSTANCE = "i-0a1af0e82b8c41d0a"


class ReleaseLifecycleTests(unittest.TestCase):
    def run_scenario(self, scenario):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "old").mkdir()
            (root / "new").mkdir()
            (root / "current").symlink_to(root / "old")
            (root / "database").write_text("existing data")
            runner = r'''
set -euo pipefail
source "$DEPLOY_SCRIPT"
cd "$TEST_ROOT"
revision=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
release="$TEST_ROOT/new"
previous="$TEST_ROOT/old"
current="$TEST_ROOT/current"
link_tmp="$TEST_ROOT/current.next"
recovery_needed=0
checks=0
is_latest_commit() {
  checks=$((checks + 1))
  if [[ "$SCENARIO" == network-failure ]]; then return 2; fi
  if [[ "$SCENARIO" == stale ]]; then return 1; fi
  if [[ "$SCENARIO" == newer-main && "$checks" == 2 ]]; then return 1; fi
  return 0
}
prepare_release() {
  echo build >> events
  [[ "$SCENARIO" != build-failure ]]
}
service_action() {
  echo "$1" >> events
  if [[ "$1" == start && "$SCENARIO" == health-failure-new-data ]]; then
    printf '%s' 'new data' > database
  fi
  if [[ "$1" == start && "$SCENARIO" == start-failure ]]; then return 1; fi
  return 0
}
backup_database() {
  echo backup >> events
  [[ "$SCENARIO" != backup-failure ]] || return 1
  cp database backup
}
wait_for_health() {
  echo health >> events
  [[ "$SCENARIO" != health-failure* || "$(readlink "$current")" == "$previous" ]]
}
# Exercise real link replacement on both macOS and Linux.
mv() {
  python3 -c 'import os,sys; os.replace(sys.argv[-2], sys.argv[-1])' "$@"
}
trap recover_on_exit EXIT
deploy_release
'''
            result = subprocess.run(
                ["bash", "-c", runner], capture_output=True, text=True,
                env={**os.environ, "TEST_ROOT": str(root), "SCENARIO": scenario,
                     "DEPLOY_SCRIPT": str(DEPLOY / "deploy-backend.sh")},
            )
            events = (root / "events").read_text().splitlines() if (root / "events").exists() else []
            active = (root / "current").resolve().name
            expected_data = "new data" if scenario == "health-failure-new-data" else "existing data"
            self.assertEqual((root / "database").read_text(), expected_data)
            backup = (root / "backup").read_text() if (root / "backup").exists() else None
            return result, events, active, backup

    def test_success_backs_up_before_switching_and_keeps_new_release(self):
        result, events, active, backup = self.run_scenario("success")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(events, ["build", "stop", "backup", "start", "health"])
        self.assertEqual(active, "new")
        self.assertEqual(backup, "existing data")

    def test_build_failure_does_not_stop_the_running_service(self):
        result, events, active, _ = self.run_scenario("build-failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(events, ["build"])
        self.assertEqual(active, "old")

    def test_backup_failure_restarts_previous_release(self):
        result, events, active, backup = self.run_scenario("backup-failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(events, ["build", "stop", "backup", "restart", "health"])
        self.assertEqual(active, "old")
        self.assertIsNone(backup)

    def test_start_or_health_failure_rolls_back_code_without_restoring_data(self):
        for scenario in ("start-failure", "health-failure"):
            with self.subTest(scenario=scenario):
                result, events, active, backup = self.run_scenario(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(events[-2:], ["restart", "health"])
                self.assertEqual(active, "old")
                self.assertEqual(backup, "existing data")

    def test_stale_commit_is_skipped_before_build(self):
        result, events, active, _ = self.run_scenario("stale")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(events, [])
        self.assertEqual(active, "old")

    def test_rollback_preserves_writes_made_by_the_failed_release(self):
        result, _, active, backup = self.run_scenario("health-failure-new-data")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(active, "old")
        self.assertEqual(backup, "existing data")

    def test_newer_main_during_build_leaves_service_running(self):
        result, events, active, _ = self.run_scenario("newer-main")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(events, ["build"])
        self.assertEqual(active, "old")

    def test_network_failure_is_not_reported_as_a_successful_skip(self):
        result, events, active, _ = self.run_scenario("network-failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(events, [])
        self.assertEqual(active, "old")


class SsmTests(unittest.TestCase):
    def test_remote_stdin_entrypoint_reaches_argument_validation(self):
        # SSM uses bash -s: BASH_SOURCE can be empty under set -u.
        result = subprocess.run(
            ["bash", "-s", "--", "invalid-revision"],
            input=(DEPLOY / "deploy-backend.sh").read_text(),
            capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("unbound variable", result.stderr)
        self.assertTrue(
            "Run this script as root" in result.stdout
            or "Expected one full commit SHA" in result.stdout,
            result.stdout + result.stderr,
        )

    def test_payload_transports_script_literally(self):
        script = 'echo "$HOME"\necho `hostname`\n'
        request = SSM.make_request(SHA, INSTANCE, script)
        command = request["Parameters"]["commands"][0]
        self.assertIn("<<'JOB_TRACKER_DEPLOY_SCRIPT'", command)
        self.assertIn(script, command)
        self.assertEqual(request["InstanceIds"], [INSTANCE])

    def test_shell_injection_and_delimiter_collision_are_rejected(self):
        for revision, instance, script in (
            (SHA + "; id", INSTANCE, "echo ok"),
            (SHA, INSTANCE + "\necho bad", "echo ok"),
            (SHA, INSTANCE, "JOB_TRACKER_DEPLOY_SCRIPT"),
        ):
            with self.assertRaises(ValueError):
                SSM.make_request(revision, instance, script)

    def test_eventual_consistency_then_success(self):
        missing = subprocess.CalledProcessError(1, "aws", stderr="InvocationDoesNotExist")
        with patch.object(SSM, "aws", side_effect=[
            missing, {"Status": "InProgress"}, {"Status": "Success", "ResponseCode": 0},
        ]), patch.object(SSM.time, "sleep"), contextlib.redirect_stdout(io.StringIO()):
            SSM.wait_for_result("command-id", INSTANCE)

    def test_failure_or_nonzero_exit_is_not_marked_successful(self):
        for status, code in (("Failed", 1), ("TimedOut", -1), ("Cancelled", -1), ("Success", 1)):
            with self.subTest(status=status, code=code), patch.object(
                SSM, "aws", return_value={"Status": status, "ResponseCode": code}
            ), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(RuntimeError):
                SSM.wait_for_result("command-id", INSTANCE)

    def test_access_denied_is_not_retried_indefinitely(self):
        denied = subprocess.CalledProcessError(1, "aws", stderr="AccessDeniedException")
        with patch.object(SSM, "aws", side_effect=denied), self.assertRaises(subprocess.CalledProcessError):
            SSM.wait_for_result("command-id", INSTANCE)

    def test_polling_has_a_deadline(self):
        with patch.object(SSM.time, "monotonic", side_effect=[0, 1201]), self.assertRaises(TimeoutError):
            SSM.wait_for_result("command-id", INSTANCE)


if __name__ == "__main__":
    unittest.main()
