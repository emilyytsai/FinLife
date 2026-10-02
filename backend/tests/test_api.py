import json
import logging
import re

import pytest

from app.config import aws_session, get_settings

STUB_REPLY = "The coach isn't connected yet (stub). I got your question and left your plan unchanged."
HOUSE = {"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.1, "rate": 0.065, "years": 30}


def chat_body(profile, events, text, session_id="test-session"):
    return {
        "session_id": session_id,
        "profile": profile,
        "events": events,
        "messages": [{"role": "user", "content": text}],
    }


def suggested_prompts(client, profile) -> list[str]:
    analysis = client.post("/analyze", json={"profile": profile}).json()["analysis"]
    return [s["prompt"] for s in analysis["suggested_scenarios"]]


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["stub_ai"] is True
    assert isinstance(body["stub_engine"], bool)


def test_health_reports_stub_engine(client, stub_engine):
    assert client.get("/health").json()["stub_engine"] is True


def test_profiles_returns_three_personas(client):
    response = client.get("/profiles")
    assert response.status_code == 200
    assert [p["id"] for p in response.json()] == ["maya", "jordan", "priya"]


def test_simulate_returns_one_row_per_age(client, maya):
    response = client.post("/simulate", json={"profile": maya, "events": []})
    assert response.status_code == 200
    years = response.json()["years"]
    assert len(years) == maya["retire_age"] - maya["age"] + 1
    assert [row["age"] for row in years] == list(range(maya["age"], maya["retire_age"] + 1))


def test_stub_responses_set_stub_header(client, maya, stub_engine):
    response = client.post("/simulate", json={"profile": maya, "events": []})
    assert response.status_code == 200
    assert response.headers["X-FinLife-Stub"] == "1"


def test_engine_responses_have_no_stub_header(client, maya, monkeypatch):
    import engine
    from app import stubs

    monkeypatch.setattr(engine, "simulate", stubs.placeholder_simulate)
    response = client.post("/simulate", json={"profile": maya, "events": []})
    assert response.status_code == 200
    assert "X-FinLife-Stub" not in response.headers


def test_stub_event_lowers_cash_from_its_age(client, maya, stub_engine):
    body = client.post("/compare", json={"profile": maya, "events": [HOUSE]}).json()
    baseline, scenario = body["baseline"]["years"], body["scenario"]["years"]
    assert scenario[5]["cash"] == baseline[5]["cash"]
    assert scenario[6]["cash"] == baseline[6]["cash"] - 15000


def test_compare_shape(client, maya):
    response = client.post("/compare", json={"profile": maya, "events": [HOUSE]})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"baseline", "scenario", "diff"}
    assert set(body["diff"]) == {"net_worth_at_retire", "retirement_at_retire", "min_cash", "min_cash_age"}
    for field, value in body["diff"].items():
        assert value == body["scenario"]["summary"][field] - body["baseline"]["summary"][field]


def test_analyze_shape(client, maya):
    response = client.post("/analyze", json={"profile": maya})
    assert response.status_code == 200
    body = response.json()
    analysis = body["analysis"]
    assert [h["code"] for h in analysis["highlights"]] == [
        "emergency_fund",
        "savings_rate",
        "debt_to_income",
        "retirement_pace",
    ]
    assert [s["event"]["type"] for s in analysis["suggested_scenarios"]] == [
        "buy_house",
        "job_loss",
        "set_retirement_pct",
    ]
    assert len(body["baseline"]["years"]) == maya["retire_age"] - maya["age"] + 1


def test_chat_suggested_prompt_adds_event_and_writes_one_audit_line(client, maya, local_dir):
    prompt = suggested_prompts(client, maya)[0]
    response = client.post("/chat", json=chat_body(maya, [], prompt))
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "stub"
    assert body["reply"].startswith("Added: ")
    assert [e["type"] for e in body["events"]] == ["buy_house"]
    assert "id" not in body["events"][0]
    assert prompt not in body["suggestions"]
    assert len(body["suggestions"]) == 2

    lines = (local_dir / "audit.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert set(record) == {
        "session_id",
        "ts",
        "request",
        "tool_calls",
        "reply",
        "status",
        "model_id",
        "guardrail_action",
        "number_check",
        "latency_ms",
    }
    assert record["session_id"] == "test-session"
    assert record["request"]["last_user_message"] == prompt
    assert record["number_check"] == "skipped"
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", record["ts"])


def test_chat_other_question_keeps_plan_and_ids(client, maya):
    events = [{"id": "e1", "type": "job_loss", "age": 31, "months": 6}]
    response = client.post("/chat", json=chat_body(maya, events, "How am I doing?"))
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == STUB_REPLY
    assert body["events"] == events


def test_chat_does_not_add_a_second_house(client, maya):
    prompt = suggested_prompts(client, maya)[0]
    response = client.post("/chat", json=chat_body(maya, [HOUSE], prompt))
    assert response.status_code == 200
    assert [e["type"] for e in response.json()["events"]] == ["buy_house"]


def test_share_then_brief_round_trips(client, maya):
    events = [{**HOUSE, "id": "e1"}, {"id": "e2", "type": "job_loss", "age": 31, "months": 6}]
    share = client.post("/share", json={"session_id": "s1", "profile": maya, "events": events, "messages": []})
    assert share.status_code == 200
    brief_id = share.json()["brief_id"]
    assert re.fullmatch(r"[a-z0-9]{8}", brief_id)
    assert share.json()["url"] == f"http://localhost:3000/brief/?id={brief_id}"

    response = client.get(f"/brief/{brief_id}")
    assert response.status_code == 200
    brief = response.json()
    assert brief["id"] == brief_id
    assert "expires_at" not in brief
    assert brief["events"] == events
    assert len(brief["goals"]) == 1
    assert len(brief["tried"]) == 1
    assert len(brief["questions"]) == 3
    assert brief["disclaimer"] == "Client-entered data, not verified. For education only. Not financial advice."


@pytest.mark.parametrize("brief_id", ["zzzzzzzz", "ZZZZ-not-an-id"])
def test_unknown_brief_returns_404(client, brief_id):
    response = client.get(f"/brief/{brief_id}")
    assert response.status_code == 404
    assert response.json() == {"error": "Brief not found"}


def test_bad_profile_returns_422_errors_shape(client, maya):
    maya["retire_age"] = 20
    response = client.post("/simulate", json={"profile": maya, "events": []})
    assert response.status_code == 422
    assert response.json() == {
        "errors": [{"field": "profile.retire_age", "message": "Retirement age must be after current age"}]
    }


def test_bad_event_returns_dotted_field_path(client, maya):
    response = client.post("/compare", json={"profile": maya, "events": [{"type": "job_loss", "age": 31, "months": 13}]})
    assert response.status_code == 422
    assert response.json() == {"errors": [{"field": "events.0.months", "message": "Must be at most 12"}]}


def test_unexpected_error_returns_500_shape(client, maya, monkeypatch):
    import engine

    def broken(*args):
        raise RuntimeError("boom")

    monkeypatch.setattr(engine, "simulate", broken)
    response = client.post("/simulate", json={"profile": maya, "events": []})
    assert response.status_code == 500
    assert response.json() == {"error": "Something went wrong"}


def test_cors_allows_frontend_and_exposes_stub_header(client):
    response = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "x-finlife-stub" in response.headers["access-control-expose-headers"].lower()


def test_stub_mode_never_needs_aws_credentials(client, maya, monkeypatch):
    """Teammates without the finlife profile can still run the API on stubs (boto3 reads AWS_PROFILE too)."""
    monkeypatch.setenv("AWS_PROFILE", "no-such-profile")
    get_settings.cache_clear()
    aws_session.cache_clear()
    try:
        assert client.post("/chat", json=chat_body(maya, [], "How am I doing?")).status_code == 200
        share = {"session_id": "s1", "profile": maya, "events": [], "messages": []}
        assert client.post("/share", json=share).status_code == 200
    finally:
        aws_session.cache_clear()


def test_request_log_line_has_no_profile_values(client, maya, caplog):
    caplog.set_level(logging.INFO, logger="finlife")
    client.post("/simulate", json={"profile": maya, "events": []})
    lines = [record.getMessage() for record in caplog.records if record.name.startswith("finlife")]
    assert any("/simulate" in line and "status=200" in line for line in lines)
    assert not any("55000" in line for line in lines)
