import json

import anthropic
import httpx2
import pytest
from anthropic.types import Message, TextBlock, ToolUseBlock, Usage

from app import coach
from app.config import get_settings
from app.numbers import allowed_numbers, unsupported_numbers
from app.stubs import analyze_or_stub, compare_or_stub

HOUSE = {"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.1, "rate": 0.065, "years": 30}
JOB_LOSS = {"type": "job_loss", "age": 31, "months": 6}
HOUSE_QUESTION = "What if I buy a $350k house at 28?"


class FakeBedrock:
    """Stands in for AnthropicBedrock: returns scripted replies (or raises scripted errors) and records each request."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.requests = []
        self.messages = self

    def create(self, **request):
        self.requests.append({**request, "messages": list(request["messages"])})
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def message(stop_reason, content) -> Message:
    return Message(
        id="msg_test",
        type="message",
        role="assistant",
        model="test",
        stop_reason=stop_reason,
        stop_sequence=None,
        content=content,
        usage=Usage(input_tokens=1, output_tokens=1),
    )


def text(reply: str) -> Message:
    return message("end_turn", [TextBlock(type="text", text=reply)])


def set_events(events: list[dict], call_id: str = "tu_1") -> Message:
    return message("tool_use", [ToolUseBlock(type="tool_use", id=call_id, name="set_events", input={"events": events})])


def throttled() -> anthropic.RateLimitError:
    request = httpx2.Request("POST", "https://bedrock-runtime.us-east-1.amazonaws.com/model/test/invoke")
    return anthropic.RateLimitError("ThrottlingException", response=httpx2.Response(429, request=request), body=None)


def tool_result(request: dict) -> dict:
    """The tool_result block the coach sent back in this request."""
    return request["messages"][-1]["content"][0]


@pytest.fixture
def bedrock(monkeypatch):
    """Turn the stub coach off and script the model. Pacing and the throttle wait are recorded, not slept."""
    monkeypatch.setenv("FINLIFE_STUB_AI", "0")
    monkeypatch.setenv("BEDROCK_MODEL_ID", "sonnet-test")
    monkeypatch.setenv("BEDROCK_FALLBACK_MODEL_ID", "haiku-test")
    get_settings.cache_clear()
    paced, slept = [], []
    monkeypatch.setattr(coach.pacing, "pace", lambda: paced.append(True))
    monkeypatch.setattr(coach.time, "sleep", slept.append)

    def script(*replies) -> FakeBedrock:
        fake = FakeBedrock(replies)
        fake.paced, fake.slept = paced, slept
        monkeypatch.setattr(coach, "bedrock_client", lambda: fake)
        return fake

    yield script
    get_settings.cache_clear()


def ask(profile, question, events=(), history=()):
    messages = [*history, {"role": "user", "content": question}]
    return coach.run_coach(profile, list(events), messages, analyze_or_stub(profile))


def test_the_event_the_model_sets_becomes_the_plan(bedrock, maya):
    bedrock(set_events([HOUSE]), text("Buying a $350k house at 28 fits your plan."))
    result = ask(maya, HOUSE_QUESTION)
    assert result.events == [HOUSE]
    assert result.reply == "Buying a $350k house at 28 fits your plan."
    assert (result.status, result.number_check, result.model_id) == ("ok", "pass", "sonnet-test")
    assert result.tool_calls == [{"name": "set_events", "input": {"events": [HOUSE]}, "is_error": False}]
    assert result.model_calls == 2


def test_tool_result_has_labels_summaries_and_rows_at_event_ages_and_retirement(bedrock, maya):
    fake = bedrock(set_events([HOUSE, JOB_LOSS]), text("Done at 28."))
    ask(maya, HOUSE_QUESTION)
    result = tool_result(fake.requests[1])
    assert result["tool_use_id"] == "tu_1"
    assert "is_error" not in result
    output = json.loads(result["content"])
    assert set(output) == {"events", "baseline", "scenario", "diff", "flags", "rows"}
    assert len(output["events"]) == 2
    assert [row["age"] for row in output["rows"]] == [28, 31, 60]


def test_invalid_tool_input_goes_back_as_an_error_the_model_can_fix(bedrock, maya):
    too_late = {**HOUSE, "age": 70}
    fake = bedrock(set_events([too_late]), set_events([HOUSE], "tu_2"), text("Done at 28."))
    result = ask(maya, HOUSE_QUESTION)
    error = tool_result(fake.requests[1])
    assert error["is_error"] is True
    assert error["content"] == "events.0.age: Age must be between 22 and 59"
    assert [call["is_error"] for call in result.tool_calls] == [True, False]
    assert result.events == [HOUSE]


def test_a_child_born_before_today_is_accepted_and_shows_todays_row(bedrock, maya):
    child = {"type": "have_child", "age": 17, "annual_cost": 15000}
    fake = bedrock(set_events([child]), text("Your 5-year-old adds costs until 35."))
    result = ask(maya, "What if I had a kid 5 years ago?")
    output = json.loads(tool_result(fake.requests[1])["content"])
    assert result.events == [child]
    assert result.tool_calls[0]["is_error"] is False
    assert [row["age"] for row in output["rows"]] == [22, 60]


def test_question_without_a_change_keeps_the_plan_and_its_ids(bedrock, maya):
    events = [{**JOB_LOSS, "id": "e1"}]
    bedrock(text("You're in good shape at 31."))
    result = ask(maya, "How am I doing?", events)
    assert result.events == events
    assert result.tool_calls == []
    assert result.model_calls == 1


def test_unchanged_events_keep_their_ids(bedrock, maya):
    bedrock(set_events([JOB_LOSS, HOUSE]), text("Done at 28."))
    result = ask(maya, HOUSE_QUESTION, [{**JOB_LOSS, "id": "e1"}])
    assert result.events == [{**JOB_LOSS, "id": "e1"}, HOUSE]


def test_an_echoed_id_stays_on_a_changed_event_and_unknown_ids_are_dropped(bedrock, maya):
    moved = {**JOB_LOSS, "age": 32, "id": "e1"}
    bedrock(set_events([moved, {**HOUSE, "id": "made-up"}]), text("Done at 32."))
    result = ask(maya, "Move the job loss to 32 and add the house.", [{**JOB_LOSS, "id": "e1"}])
    assert result.events == [moved, HOUSE]


def test_conversation_starts_with_the_user_and_ends_with_the_question(bedrock, maya):
    fake = bedrock(text("Hi at 28."))
    ask(maya, HOUSE_QUESTION, history=[{"role": "assistant", "content": "Ask me what happens if..."}])
    assert fake.requests[0]["messages"] == [{"role": "user", "content": HOUSE_QUESTION}]


def test_system_prompt_ends_with_the_context_as_json(bedrock, maya):
    fake = bedrock(text("Hi at 28."))
    ask(maya, "How am I doing?", [{**JOB_LOSS, "id": "e1"}])
    context = json.loads(fake.requests[0]["system"].rsplit("## Context\n", 1)[1])
    assert context["profile"] == maya
    assert context["events"][0]["id"] == "e1"
    assert "label" in context["events"][0]
    assert set(context["current_compare"]) == {"baseline", "scenario", "diff", "flags"}
    assert len(context["analysis"]["suggested_scenarios"]) == 3


def test_made_up_number_gets_one_rewrite(bedrock, maya):
    fake = bedrock(text("You'd have $123,456,789 at 60."), text("You'd be fine at 60."))
    result = ask(maya, "How am I doing?")
    assert result.reply == "You'd be fine at 60."
    assert (result.status, result.number_check) == ("ok", "retried")
    retry = fake.requests[1]
    assert "$123,456,789" in retry["messages"][-1]["content"]
    assert retry["tool_choice"] == {"type": "none"}


def test_second_made_up_number_falls_back_to_a_template_from_the_engine(bedrock, maya):
    bedrock(set_events([HOUSE]), text("You'd have $123,456,789."), text("Still $123,456,789."))
    result = ask(maya, HOUSE_QUESTION)
    assert (result.status, result.number_check) == ("fallback", "fallback")
    assert "123,456,789" not in result.reply
    assert "at 60" in result.reply
    assert unsupported_numbers(result.reply, allowed_numbers(compare_or_stub(maya, [HOUSE]))) == []
    assert result.events == [HOUSE]


def test_failed_rewrite_call_falls_back_to_the_template_instead_of_503(bedrock, maya):
    bedrock(set_events([HOUSE]), text("You'd have $123,456,789."), throttled(), throttled())
    result = ask(maya, HOUSE_QUESTION)
    assert (result.status, result.number_check) == ("fallback", "fallback")
    assert result.events == [HOUSE]


def test_reply_cut_off_at_max_tokens_falls_back_to_the_template(bedrock, maya):
    cut_off = message("max_tokens", [TextBlock(type="text", text="Buying a $350k house at 28 would")])
    bedrock(set_events([HOUSE]), cut_off)
    result = ask(maya, HOUSE_QUESTION)
    assert result.status == "fallback"
    assert not result.reply.endswith("would")


def test_tool_loop_stops_after_3_rounds(bedrock, maya):
    fake = bedrock(*(set_events([HOUSE], f"tu_{i}") for i in range(4)))
    result = ask(maya, HOUSE_QUESTION)
    assert len(fake.requests) == 4
    assert result.status == "fallback"


def test_every_model_call_is_paced(bedrock, maya):
    fake = bedrock(set_events([HOUSE]), text("Done at 28."))
    ask(maya, HOUSE_QUESTION)
    assert len(fake.paced) == len(fake.requests) == 2


def test_throttled_call_waits_2_seconds_then_uses_the_fallback_model(bedrock, maya):
    fake = bedrock(throttled(), set_events([HOUSE]), text("Done at 28."))
    result = ask(maya, HOUSE_QUESTION)
    assert fake.slept == [2]
    assert [request["model"] for request in fake.requests] == ["sonnet-test", "haiku-test", "haiku-test"]
    assert result.model_id == "haiku-test"
    assert result.events == [HOUSE]


def test_coach_is_busy_when_the_fallback_fails_too(bedrock, maya):
    bedrock(throttled(), throttled())
    with pytest.raises(coach.CoachBusy):
        ask(maya, HOUSE_QUESTION)


def test_chat_returns_503_and_still_writes_one_audit_record(client, bedrock, maya, local_dir):
    bedrock(throttled(), throttled())
    messages = [{"role": "user", "content": HOUSE_QUESTION}]
    response = client.post("/chat", json={"session_id": "s1", "profile": maya, "events": [], "messages": messages})
    assert response.status_code == 503
    assert response.json() == {"error": "The coach is busy. Try again in a few seconds."}
    lines = (local_dir / "audit.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["status"] == "error"


@pytest.mark.aws
def test_coach_adds_house_at_28(maya, monkeypatch):
    """'What if I buy a $350k house at 28?' adds buy_house at 28 (price 350000) with a reply under 80 words that passes the number check."""
    monkeypatch.setenv("FINLIFE_STUB_AI", "0")
    get_settings.cache_clear()
    try:
        result = ask(maya, HOUSE_QUESTION)
    finally:
        get_settings.cache_clear()
    houses = [event for event in result.events if event["type"] == "buy_house"]
    assert [(house["age"], house["price"]) for house in houses] == [(28, 350000)]
    assert len(result.reply.split()) < 80
    assert result.number_check in ("pass", "retried")
    assert result.status == "ok"
