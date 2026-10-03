"""Build the frontend's static export against the deployed API and publish it on Amplify Hosting.

A manual Amplify deploy (zip upload, no GitHub connection). Rerun it after frontend changes land.
Works the same in Windows PowerShell and macOS. From the repo root:

    .venv/Scripts/python deploy/deploy_frontend.py          (Windows)
    .venv/bin/python deploy/deploy_frontend.py              (macOS)

Options:
    --api-url URL     API base URL baked into the build (default: the finlife stack's FunctionUrl).
    --install         Run `npm ci` before building.
    --profile NAME    AWS CLI profile (default: finlife, or $AWS_PROFILE).

The first run creates the Amplify app. Then redeploy the API once so share links and CORS use the
Amplify URL; the script prints that command.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from deploy import BUILD, REGION, ROOT, STACK, aws, run

FRONTEND = ROOT / "frontend"
OUT = FRONTEND / "out"
ZIP_BASE = BUILD / "frontend"
APP_NAME = "finlife"
BRANCH = "main"
# Unknown paths get the static export's 404 page.
CUSTOM_RULES = [{"source": "/<*>", "target": "/404.html", "status": "404"}]


def function_url(profile: str) -> str:
    url = aws(profile, "cloudformation", "describe-stacks", "--stack-name", STACK,
              "--query", "Stacks[0].Outputs[?OutputKey=='FunctionUrl'].OutputValue | [0]",
              "--output", "text", capture=True).strip()
    if not url or url == "None":
        sys.exit("No FunctionUrl output on the finlife stack. Run deploy/deploy.py first.")
    return url.rstrip("/")


def build(api_url: str, install: bool) -> None:
    npm = shutil.which("npm")
    if not npm:
        sys.exit("npm not found. Install Node.js first.")
    env = {**os.environ, "NEXT_PUBLIC_API_URL": api_url}
    if install:
        subprocess.run([npm, "ci"], cwd=FRONTEND, check=True, env=env)
    shutil.rmtree(OUT, ignore_errors=True)
    print(f"+ npm run build  (NEXT_PUBLIC_API_URL={api_url})", flush=True)
    subprocess.run([npm, "run", "build"], cwd=FRONTEND, check=True, env=env)
    if not (OUT / "index.html").exists() or not (OUT / "brief" / "index.html").exists():
        sys.exit("The build has no out/index.html or out/brief/index.html.")


def amplify_app(profile: str) -> tuple[str, str]:
    """(app id, default domain) of the finlife Amplify app and its main branch, created on the first run."""
    apps = json.loads(aws(profile, "amplify", "list-apps", "--output", "json", capture=True))["apps"]
    app = next((a for a in apps if a["name"] == APP_NAME), None)
    if app is None:
        app = json.loads(aws(profile, "amplify", "create-app", "--name", APP_NAME, "--platform", "WEB",
                             "--custom-rules", json.dumps(CUSTOM_RULES), "--output", "json", capture=True))["app"]
    branches = json.loads(aws(profile, "amplify", "list-branches", "--app-id", app["appId"],
                              "--output", "json", capture=True))["branches"]
    if not any(b["branchName"] == BRANCH for b in branches):
        aws(profile, "amplify", "create-branch", "--app-id", app["appId"], "--branch-name", BRANCH,
            "--stage", "PRODUCTION", capture=True)
    return app["appId"], app["defaultDomain"]


def publish(profile: str, app_id: str) -> None:
    archive = shutil.make_archive(str(ZIP_BASE), "zip", root_dir=OUT)
    deployment = json.loads(aws(profile, "amplify", "create-deployment", "--app-id", app_id,
                                "--branch-name", BRANCH, "--output", "json", capture=True))
    print(f"+ upload {Path(archive).name}", flush=True)
    request = urllib.request.Request(deployment["zipUploadUrl"], data=Path(archive).read_bytes(), method="PUT",
                                     headers={"Content-Type": "application/zip"})
    urllib.request.urlopen(request, timeout=300).close()
    job_id = deployment["jobId"]
    aws(profile, "amplify", "start-deployment", "--app-id", app_id, "--branch-name", BRANCH,
        "--job-id", job_id, capture=True)
    for _ in range(60):
        status = aws(profile, "amplify", "get-job", "--app-id", app_id, "--branch-name", BRANCH, "--job-id", job_id,
                     "--query", "job.summary.status", "--output", "text", capture=True).strip()
        if status == "SUCCEED":
            return
        if status in ("FAILED", "CANCELLED"):
            sys.exit(f"Amplify deployment {job_id} ended with {status}.")
        time.sleep(5)
    sys.exit(f"Amplify deployment {job_id} is still running; check the Amplify console.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-url")
    parser.add_argument("--install", action="store_true")
    parser.add_argument("--profile", default=os.environ.get("AWS_PROFILE", "finlife"))
    args = parser.parse_args()

    api_url = (args.api_url or function_url(args.profile)).rstrip("/")
    build(api_url, args.install)
    app_id, domain = amplify_app(args.profile)
    publish(args.profile, app_id)

    site = f"https://{BRANCH}.{domain}"
    print(f"\nAmplify URL: {site}")
    print("If share links or CORS don't use it yet, redeploy the API once:")
    print(f'  python deploy/deploy.py --skip-build --frontend-url {site} '
          f'--allowed-origins "{site},http://localhost:3000"')


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(f"Deploy failed at: {' '.join(map(str, error.cmd))}\n{error.stderr or ''}")
