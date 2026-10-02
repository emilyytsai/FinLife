import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROFILES = json.loads((BACKEND_DIR / "fixtures" / "profiles.json").read_text(encoding="utf-8"))


def _aws_ready() -> bool:
    """True when BEDROCK_MODEL_ID is set and AWS credentials resolve."""
    settings = get_settings()
    if not settings.bedrock_model_id:
        return False
    try:
        import boto3

        return boto3.Session(profile_name=settings.aws_profile or None).get_credentials() is not None
    except Exception:
        return False


def pytest_collection_modifyitems(config, items):
    aws_items = [item for item in items if item.get_closest_marker("aws")]
    if not aws_items or _aws_ready():
        return
    skip_aws = pytest.mark.skip(reason="Needs AWS credentials and BEDROCK_MODEL_ID")
    for item in aws_items:
        item.add_marker(skip_aws)


@pytest.fixture
def local_dir(tmp_path):
    return tmp_path


@pytest.fixture
def client(local_dir, monkeypatch):
    monkeypatch.setenv("FINLIFE_LOCAL_DIR", str(local_dir))
    monkeypatch.setenv("FINLIFE_STUB_AI", "1")
    monkeypatch.setenv("BRIEFS_TABLE", "")
    monkeypatch.setenv("AUDIT_TABLE", "")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
    get_settings.cache_clear()
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()


@pytest.fixture
def stub_engine(monkeypatch):
    """Make every engine function raise NotImplementedError so the API falls back to stubs.py."""
    import engine

    def not_ready(*args, **kwargs):
        raise NotImplementedError("forced by test")

    for name in ("simulate", "compare", "analyze", "money", "label"):
        monkeypatch.setattr(engine, name, not_ready)


@pytest.fixture
def profiles():
    return copy.deepcopy(PROFILES)


@pytest.fixture
def maya():
    return copy.deepcopy(next(p["profile"] for p in PROFILES if p["id"] == "maya"))
