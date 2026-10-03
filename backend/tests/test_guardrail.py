import json
import logging

import pytest

from app import guardrail
from app.config import get_settings
from app.guardrail import check_output

BLOCKED = "I can't recommend investments. A licensed adviser can help with that, and I can show you how different choices play out in your plan."
REPLY = "Buying a $350k house at 28 fits your plan."


class FakeGuardrail:
    """Stands in for the bedrock-runtime client: returns one scripted response (or raises it) and records the request."""

    def __init__(self, response):
        self.response = response
        self.requests = []

    def apply_guardrail(self, **request):
        self.requests.append(request)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def allowed() -> dict:
    return {"action": "NONE", "outputs": []}


def intervened() -> dict:
    return {"action": "GUARDRAIL_INTERVENED", "outputs": [{"text": BLOCKED}]}


@pytest.fixture
def bedrock_guardrail(monkeypatch):
    """Configure a guardrail and script its response. Pacing is recorded, not slept."""
    monkeypatch.setenv("GUARDRAIL_ID", "gr-test")
    monkeypatch.setenv("GUARDRAIL_VERSION", "1")
    get_settings.cache_clear()
    paced = []
    monkeypatch.setattr(guardrail.pacing, "pace", lambda: paced.append(True))

    def script(response) -> FakeGuardrail:
        fake = FakeGuardrail(response)
        fake.paced = paced
        monkeypatch.setattr(guardrail, "guardrail_client", lambda: fake)
        return fake

    yield script
    get_settings.cache_clear()


def test_no_guardrail_id_returns_the_reply_without_calling_aws(monkeypatch):
    monkeypatch.setenv("GUARDRAIL_ID", "")
    get_settings.cache_clear()
    monkeypatch.setattr(guardrail, "guardrail_client", lambda: pytest.fail("called AWS"))
    try:
        assert check_output(REPLY) == (REPLY, "NONE_LOCAL")
    finally:
        get_settings.cache_clear()


def test_allowed_reply_comes_back_unchanged_after_one_paced_output_check(bedrock_guardrail):
    fake = bedrock_guardrail(allowed())
    assert check_output(REPLY) == (REPLY, "NONE")
    assert fake.requests == [
        {
            "guardrailIdentifier": "gr-test",
            "guardrailVersion": "1",
            "source": "OUTPUT",
            "content": [{"text": {"text": REPLY}}],
        }
    ]
    assert fake.paced == [True]


def test_blocked_reply_is_replaced_by_the_guardrail_message(bedrock_guardrail):
    bedrock_guardrail(intervened())
    assert check_output("You should buy VTI.") == (BLOCKED, "GUARDRAIL_INTERVENED")


def test_failed_guardrail_call_keeps_the_reply_and_logs_the_error(bedrock_guardrail, caplog):
    bedrock_guardrail(RuntimeError("ExpiredTokenException"))
    caplog.set_level(logging.ERROR)
    assert check_output(REPLY) == (REPLY, "ERROR")
    assert "Guardrail check failed" in caplog.text


def test_blocked_chat_reply_has_status_blocked_and_is_audited(client, bedrock_guardrail, maya, local_dir):
    bedrock_guardrail(intervened())
    body = {"session_id": "s1", "profile": maya, "events": [], "messages": [{"role": "user", "content": "Hi"}]}
    response = client.post("/chat", json=body)
    assert response.status_code == 200
    assert (response.json()["reply"], response.json()["status"]) == (BLOCKED, "blocked")
    [line] = (local_dir / "audit.jsonl").read_text(encoding="utf-8").splitlines()
    record = json.loads(line)
    assert (record["reply"], record["status"], record["guardrail_action"]) == (BLOCKED, "blocked", "GUARDRAIL_INTERVENED")


@pytest.fixture
def real_guardrail():
    """The finlife-advice guardrail from backend/.env, on a fresh client."""
    get_settings.cache_clear()
    guardrail.guardrail_client.cache_clear()
    if not get_settings().guardrail_id:
        pytest.skip("Needs GUARDRAIL_ID and GUARDRAIL_VERSION in backend/.env")
    yield
    get_settings.cache_clear()


@pytest.mark.aws
def test_bait_reply_recommending_a_fund_is_blocked(real_guardrail):
    bait = "You should put your down payment savings into VTI, a low-cost index fund, instead of a savings account."
    assert check_output(bait) == (BLOCKED, "GUARDRAIL_INTERVENED")


@pytest.mark.aws
def test_demo_reply_about_401k_savings_is_not_blocked(real_guardrail):
    """The third demo question must not trip the investment-advice topic."""
    reply = (
        "Raising your 401(k) to 10% at 25 leaves you with $1.2M at 60, compared with $980k on your current path. "
        "Your cash is lowest at $8.5k at age 28. The tradeoff is a little less spending money each month."
    )
    assert check_output(reply) == (reply, "NONE")
