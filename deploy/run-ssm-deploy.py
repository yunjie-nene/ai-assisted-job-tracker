"""Send the checked-out deployment script to EC2 and wait for its result."""

import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time


def aws(*args):
    result = subprocess.run(
        ["aws", "--region", os.environ["AWS_REGION"], *args, "--output", "json"],
        check=True, capture_output=True, text=True, timeout=45,
    )
    return json.loads(result.stdout)


def make_request(revision, instance, script):
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Expected a full commit SHA.")
    if not re.fullmatch(r"i-[0-9a-f]{17}", instance):
        raise ValueError("Expected an EC2 instance ID.")
    delimiter = "JOB_TRACKER_DEPLOY_SCRIPT"
    if delimiter in script:
        raise ValueError("Deployment script contains the heredoc delimiter.")
    # The outer timeout also bounds the remote process if the runner is canceled.
    command = (
        f"timeout --signal=TERM --kill-after=90s 900s bash -s -- {revision} <<'{delimiter}'\n"
        f"{script.rstrip()}\n{delimiter}"
    )
    return {
        "DocumentName": "AWS-RunShellScript",
        "InstanceIds": [instance],
        "Comment": f"Deploy job tracker {revision}",
        "TimeoutSeconds": 120,
        "Parameters": {"commands": [command], "executionTimeout": ["1080"]},
    }


def wait_for_result(command_id, instance):
    deadline = time.monotonic() + 1200
    while time.monotonic() < deadline:
        try:
            result = aws(
                "ssm", "get-command-invocation", "--command-id", command_id,
                "--instance-id", instance,
            )
        except subprocess.CalledProcessError as error:
            # SSM is eventually consistent immediately after SendCommand.
            if "InvocationDoesNotExist" not in error.stderr:
                raise
            time.sleep(5)
            continue
        status = result["Status"]
        if status in {"Pending", "InProgress", "Delayed", "Cancelling"}:
            time.sleep(5)
            continue
        print(result.get("StandardOutputContent", ""))
        print(result.get("StandardErrorContent", ""))
        if status != "Success" or result.get("ResponseCode") != 0:
            raise RuntimeError(f"Remote deployment failed: {status}")
        return
    raise TimeoutError(
        f"Stopped waiting for {command_id}. Check SSM Run Command before retrying."
    )


def main():
    revision = os.environ["GITHUB_SHA"]
    instance = os.environ["EC2_INSTANCE_ID"]
    script = Path(__file__).with_name("deploy-backend.sh").read_text()
    request = make_request(revision, instance, script)
    with tempfile.NamedTemporaryFile(mode="w+", suffix=".json") as payload:
        json.dump(request, payload)
        payload.flush()
        result = aws("ssm", "send-command", "--cli-input-json", f"file://{payload.name}")
    command_id = result["Command"]["CommandId"]
    print(f"SSM command: {command_id}", flush=True)
    wait_for_result(command_id, instance)


if __name__ == "__main__":
    main()
