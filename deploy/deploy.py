"""Build the FinLife API for Lambda and deploy template.yaml with CloudFormation.

Works the same in Windows PowerShell and macOS, with no SAM CLI or Docker. From the repo root:

    .venv/Scripts/python deploy/deploy.py          (Windows)
    .venv/bin/python deploy/deploy.py              (macOS)

Options:
    --frontend-url URL        Base of the share links, e.g. the Amplify URL. Kept from the last deploy if omitted.
    --allowed-origins A,B     Browser origins for CORS. Kept from the last deploy if omitted.
    --profile NAME            AWS CLI profile (default: finlife, or $AWS_PROFILE).
    --skip-build              Reuse backend/.build/lambda from the last run.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
BUILD = BACKEND / ".build"
PACKAGE = BUILD / "lambda"
PACKAGED_TEMPLATE = BUILD / "packaged.yaml"
STACK = "finlife"
REGION = "us-east-1"
SOURCES = ["app", "engine", "fixtures", "lambda_handler.py"]


def run(args: list[str], capture: bool = False) -> str:
    print("+", " ".join(args), flush=True)
    result = subprocess.run(args, check=True, text=True, capture_output=capture)
    return result.stdout if capture else ""


def aws(profile: str, *args: str, capture: bool = False) -> str:
    return run(["aws", *args, "--profile", profile, "--region", REGION], capture=capture)


def build() -> None:
    """Linux wheels for Lambda's Python 3.12 on x86_64, plus the backend source (no .env, tests, or caches)."""
    shutil.rmtree(PACKAGE, ignore_errors=True)
    PACKAGE.mkdir(parents=True)
    run([
        sys.executable, "-m", "pip", "install", "--quiet",
        "--requirement", str(BACKEND / "requirements.txt"),
        "--target", str(PACKAGE),
        "--platform", "manylinux2014_x86_64",
        "--implementation", "cp",
        "--python-version", "3.12",
        "--only-binary=:all:",
    ])
    for name in SOURCES:
        source = BACKEND / name
        if source.is_dir():
            shutil.copytree(source, PACKAGE / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        else:
            shutil.copy2(source, PACKAGE / name)


def deploy_bucket(profile: str) -> str:
    """One S3 bucket per account for the packaged code, created on the first deploy."""
    account = aws(profile, "sts", "get-caller-identity", "--query", "Account", "--output", "text", capture=True).strip()
    bucket = f"finlife-deploy-{account}-{REGION}"
    try:
        aws(profile, "s3api", "head-bucket", "--bucket", bucket, capture=True)
    except subprocess.CalledProcessError:
        aws(profile, "s3api", "create-bucket", "--bucket", bucket, capture=True)
    return bucket


def clear_failed_first_deploy(profile: str) -> None:
    """A stack whose first create rolled back can't be updated, only deleted and created again."""
    try:
        status = aws(profile, "cloudformation", "describe-stacks", "--stack-name", STACK,
                     "--query", "Stacks[0].StackStatus", "--output", "text", capture=True).strip()
    except subprocess.CalledProcessError:
        return  # no stack yet
    if status == "ROLLBACK_COMPLETE":
        aws(profile, "cloudformation", "delete-stack", "--stack-name", STACK)
        aws(profile, "cloudformation", "wait", "stack-delete-complete", "--stack-name", STACK)


def deploy(profile: str, overrides: list[str]) -> None:
    bucket = deploy_bucket(profile)
    aws(profile, "cloudformation", "package",
        "--template-file", str(ROOT / "template.yaml"),
        "--s3-bucket", bucket,
        "--output-template-file", str(PACKAGED_TEMPLATE),
        capture=True)  # its upload progress and "run this next" hint are noise here
    clear_failed_first_deploy(profile)
    args = ["cloudformation", "deploy",
            "--template-file", str(PACKAGED_TEMPLATE),
            "--stack-name", STACK,
            "--capabilities", "CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND",
            "--no-fail-on-empty-changeset"]
    if overrides:
        args += ["--parameter-overrides", *overrides]
    aws(profile, *args)


def print_outputs(profile: str) -> None:
    outputs = json.loads(aws(profile, "cloudformation", "describe-stacks", "--stack-name", STACK,
                             "--query", "Stacks[0].Outputs", "--output", "json", capture=True))
    print()
    for output in outputs:
        print(f"{output['OutputKey']}: {output['OutputValue']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--frontend-url")
    parser.add_argument("--allowed-origins")
    parser.add_argument("--profile", default=os.environ.get("AWS_PROFILE", "finlife"))
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()

    overrides = []
    if args.frontend_url:
        overrides.append(f"FrontendUrl={args.frontend_url.rstrip('/')}")
    if args.allowed_origins:
        overrides.append(f"AllowedOrigins={args.allowed_origins}")

    if not args.skip_build:
        build()
    deploy(args.profile, overrides)
    print_outputs(args.profile)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(f"Deploy failed at: {' '.join(error.cmd)}\n{error.stderr or ''}")
