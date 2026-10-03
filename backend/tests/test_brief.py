import json

import pytest

from app import brief, coach
from app.brief import FALLBACK_QUESTIONS, build_brief
from app.config import get_settings
from app.models import Brief
from app.stubs import compare_or_stub, label_or_stub, money_or_stub
from tests.test_coach import FakeBedrock, text, throttled

HOUSE = {"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.1, "rate": 0.065, "years": 30}
JOB_LOSS = {"type": "job_loss", "age": 31, "months": 6}
FLAG = {"age": 31, "code": "negative_cash", "message": "Cash runs out during the job loss"}
QUESTIONS = [
    "How important is owning a home by 28 compared with your other goals?",
    "How secure does your job feel over the next few years?",
    "How would you rebuild savings after a stretch without income?",
]
MADE_UP = {"age": 40, "text": "Net worth reaches $7.7M by 40."}


@pytest.fixture
def haiku(monkeypatch):
    """Turn the stub AI off, script the model, and record the guardrail check. The scenario gets one flag."""
    monkeypatch.setenv("FINLIFE_STUB_AI", "0")
    monkeypatch.setenv("BEDROCK_MODEL_ID", "sonnet-test")
    monkeypatch.setenv("BEDROCK_FALLBACK_MODEL_ID", "haiku-test")
    get_settings.cache_clear()
    monkeypatch.setattr(coach.pacing, "pace", lambda: None)
    monkeypatch.setattr(coach.time, "sleep", lambda seconds: None)
    checked = []

    def guardrail(text: str) -> tuple[str, str]:
        checked.append(text)
        return text, "NONE"

    def compare_with_flag(profile, events):
        compare = compare_or_stub(profile, events)
        compare["scenario"]["flags"] = [*compare["scenario"]["flags"], FLAG]
        return compare

    monkeypatch.setattr(brief, "check_output", guardrail)
    monkeypatch.setattr(brief, "compare_or_stub", compare_with_flag)

    def script(*replies) -> FakeBedrock:
        fake = FakeBedrock(replies)
        fake.checked = checked
        monkeypatch.setattr(coach, "bedrock_client", lambda: fake)
        return fake

    yield script
    get_settings.cache_clear()


def draft(risks: list[dict], questions: list[str] = QUESTIONS):
    return text(json.dumps({"risks": risks, "questions": questions}))


def good_risk(profile: dict) -> dict:
    """A risk that only uses numbers from compare."""
    summary = compare_or_stub(profile, [HOUSE, JOB_LOSS])["scenario"]["summary"]
    worth = money_or_stub(summary["net_worth_at_retire"])
    return {"age": profile["retire_age"], "text": f"Net worth at {profile['retire_age']} is {worth} with these changes."}


def make_brief(profile: dict) -> dict:
    """Every case must still produce a valid Brief."""
    result = build_brief(profile, [HOUSE, JOB_LOSS], [])
    Brief.model_validate(result)
    return result


def fallback_risks(result: dict) -> list[dict]:
    return [{"age": flag["age"], "text": flag["message"]} for flag in result["compare"]["scenario"]["flags"]][:4]


def assert_fallbacks(result: dict) -> None:
    assert result["risks"] == fallback_risks(result) != []
    assert result["questions"] == FALLBACK_QUESTIONS


def test_haiku_writes_the_risks_and_questions_in_one_call(haiku, maya):
    risk = good_risk(maya)
    fake = haiku(text("```json\n" + json.dumps({"risks": [risk], "questions": QUESTIONS}) + "\n```"))
    result = make_brief(maya)
    assert (result["risks"], result["questions"]) == ([risk], QUESTIONS)
    [request] = fake.requests
    assert request["model"] == "haiku-test"
    assert "tools" not in request
    assert request["output_config"]["format"]["type"] == "json_schema"  # Bedrock returns valid JSON every time
    data = json.loads(request["messages"][0]["content"])
    assert data["events"] == [label_or_stub(HOUSE), label_or_stub(JOB_LOSS)]
    assert data["flags"] == result["compare"]["scenario"]["flags"]
    assert {"baseline", "scenario", "diff", "analysis"} <= set(data)


def test_one_guardrail_check_covers_every_risk_and_question(haiku, maya):
    risk = good_risk(maya)
    fake = haiku(draft([risk]))
    make_brief(maya)
    assert fake.checked == ["\n".join([risk["text"], *QUESTIONS])]


def test_invalid_json_gets_one_retry_that_names_the_problem(haiku, maya):
    risk = good_risk(maya)
    fake = haiku(text("Here are the risks: cash runs low."), draft([risk]))
    result = make_brief(maya)
    assert (result["risks"], result["questions"]) == ([risk], QUESTIONS)
    retry = fake.requests[1]["messages"]
    assert [message["role"] for message in retry] == ["user", "assistant", "user"]
    assert "JSON" in retry[-1]["content"]


def test_invalid_json_twice_uses_the_fallbacks(haiku, maya):
    fake = haiku(text("not json"), text("still not json"))
    assert_fallbacks(make_brief(maya))
    assert len(fake.requests) == 2
    assert fake.checked == []


def test_two_questions_instead_of_three_twice_uses_the_fallbacks(haiku, maya):
    fake = haiku(draft([good_risk(maya)], QUESTIONS[:2]), draft([good_risk(maya)], QUESTIONS[:2]))
    assert_fallbacks(make_brief(maya))
    assert len(fake.requests) == 2


def test_risk_with_a_made_up_number_is_dropped(haiku, maya):
    risk = good_risk(maya)
    haiku(draft([MADE_UP, risk]))
    assert make_brief(maya)["risks"] == [risk]


def test_flag_risks_replace_model_risks_when_none_pass_the_number_check(haiku, maya):
    haiku(draft([MADE_UP]))
    result = make_brief(maya)
    assert result["risks"] == fallback_risks(result)
    assert result["questions"] == QUESTIONS


def test_question_with_a_made_up_number_is_swapped_for_a_fallback_question(haiku, maya):
    questions = [QUESTIONS[0], "Could you set aside $9,999 a month after the move?", QUESTIONS[2]]
    haiku(draft([good_risk(maya)], questions))
    assert make_brief(maya)["questions"] == [QUESTIONS[0], FALLBACK_QUESTIONS[1], QUESTIONS[2]]


def test_guardrail_intervention_replaces_all_model_text_with_the_fallbacks(haiku, maya, monkeypatch):
    haiku(draft([good_risk(maya)]))
    monkeypatch.setattr(brief, "check_output", lambda text: ("I can't recommend investments.", "GUARDRAIL_INTERVENED"))
    assert_fallbacks(make_brief(maya))


def test_bedrock_error_uses_the_fallbacks_instead_of_failing_the_share(haiku, maya):
    fake = haiku(throttled())
    assert_fallbacks(make_brief(maya))
    assert len(fake.requests) == 1


def test_stub_ai_uses_the_fallbacks_without_calling_bedrock(haiku, maya, monkeypatch):
    monkeypatch.setenv("FINLIFE_STUB_AI", "1")
    get_settings.cache_clear()
    fake = haiku()
    assert_fallbacks(make_brief(maya))
    assert fake.requests == []
