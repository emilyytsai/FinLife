import json
import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models import ChatRequest, DemoProfile, Profile, SimulateRequest, event_json_schema, friendly_errors

SCHEMA_MD = Path(__file__).resolve().parents[2] / "contracts" / "schema.md"


def schema_json_blocks() -> list[str]:
    return re.findall(r"```json\n(.*?)```", SCHEMA_MD.read_text(encoding="utf-8"), re.S)


def errors_for(model, data) -> list[dict]:
    with pytest.raises(ValidationError) as exc_info:
        model.model_validate(data)
    return friendly_errors(exc_info.value.errors())


def job_loss(age, months=6):
    return {"type": "job_loss", "age": age, "months": months}


def house(age=28, price=350000):
    return {"type": "buy_house", "age": age, "price": price, "down_pct": 0.10, "rate": 0.065, "years": 30}


def test_all_personas_validate(profiles):
    assert [p["id"] for p in profiles] == ["maya", "jordan", "priya"]
    for persona in profiles:
        DemoProfile.model_validate(persona)


def test_schema_maya_example_validates_and_matches_fixture(maya):
    example = json.loads(schema_json_blocks()[0])
    Profile.model_validate(example)
    assert example == maya


def test_schema_event_examples_validate_against_maya(maya):
    events = [json.loads(line) for line in schema_json_blocks()[1].strip().splitlines()]
    assert [e["type"] for e in events] == ["buy_house", "have_child", "job_loss", "set_retirement_pct", "new_debt"]
    SimulateRequest.model_validate({"profile": maya, "events": events})


def test_event_id_is_optional_and_kept(maya):
    request = SimulateRequest.model_validate({"profile": maya, "events": [job_loss(31), {**job_loss(33), "id": "e1"}]})
    assert request.events[0].id is None
    assert request.events[1].id == "e1"


def test_rejects_retire_age_not_after_age(maya):
    maya["retire_age"] = maya["age"]
    assert errors_for(Profile, maya) == [{"field": "retire_age", "message": "Retirement age must be after current age"}]


def test_rejects_retirement_pct_over_100_percent(maya):
    maya["retirement_pct"] = 1.5
    assert errors_for(Profile, maya) == [{"field": "retirement_pct", "message": "Must be at most 100%"}]


def test_rejects_six_debts(maya):
    maya["debts"] = maya["debts"] * 6
    assert errors_for(Profile, maya) == [{"field": "debts", "message": "You can have at most 5 debts"}]


def test_rejects_eleven_events(maya):
    events = [job_loss(23 + i) for i in range(11)]
    assert errors_for(SimulateRequest, {"profile": maya, "events": events}) == [
        {"field": "events", "message": "You can have at most 10 events"}
    ]


def test_rejects_two_house_purchases(maya):
    errors = errors_for(SimulateRequest, {"profile": maya, "events": [house(28), house(35)]})
    assert errors == [{"field": "events", "message": "Only one home purchase is allowed"}]


def test_rejects_event_before_current_age(maya):
    errors = errors_for(SimulateRequest, {"profile": maya, "events": [job_loss(21)]})
    assert errors == [{"field": "events.0.age", "message": "Age must be between 22 and 59"}]


def test_accepts_a_child_born_before_current_age(maya):
    child = {"type": "have_child", "age": 17, "annual_cost": 15000}
    SimulateRequest.model_validate({"profile": maya, "events": [child]})


def test_rejects_a_child_already_18_or_older(maya):
    child = {"type": "have_child", "age": 4, "annual_cost": 15000}
    errors = errors_for(SimulateRequest, {"profile": maya, "events": [child]})
    assert errors == [{"field": "events.0.age", "message": "Age must be between 5 and 59"}]


def test_rejects_event_at_or_after_retire_age(maya):
    errors = errors_for(SimulateRequest, {"profile": maya, "events": [job_loss(25), job_loss(60)]})
    assert errors == [{"field": "events.1.age", "message": "Age must be between 22 and 59"}]


def test_rejects_job_loss_over_12_months(maya):
    errors = errors_for(SimulateRequest, {"profile": maya, "events": [job_loss(31, months=13)]})
    assert errors == [{"field": "events.0.months", "message": "Must be at most 12"}]


def test_rejects_unknown_event_type(maya):
    errors = errors_for(SimulateRequest, {"profile": maya, "events": [{"type": "win_lottery", "age": 30}]})
    assert len(errors) == 1
    assert errors[0]["field"] == "events.0"
    assert errors[0]["message"].startswith("Unknown event type 'win_lottery'. Use one of: buy_house,")


def test_rejects_unknown_field(maya):
    maya["name"] = "Maya"
    assert errors_for(Profile, maya) == [{"field": "name", "message": "Unknown field 'name'"}]


def test_money_limits_read_as_dollars(maya):
    errors = errors_for(SimulateRequest, {"profile": maya, "events": [house(price=5000)]})
    assert errors == [{"field": "events.0.price", "message": "Must be at least $10,000"}]


def test_chat_requires_last_message_from_user(maya):
    data = {
        "session_id": "s1",
        "profile": maya,
        "events": [],
        "messages": [{"role": "user", "content": "Hi"}, {"role": "assistant", "content": "Hello"}],
    }
    assert errors_for(ChatRequest, data) == [{"field": "messages", "message": "The last message must be from the user"}]


def test_event_json_schema_is_self_contained():
    schema = event_json_schema()
    text = json.dumps(schema)
    assert schema["type"] == "array"
    assert "$ref" not in text and "$defs" not in text
    types = [option["properties"]["type"]["const"] for option in schema["items"]["oneOf"]]
    assert types == ["buy_house", "have_child", "job_loss", "set_retirement_pct", "new_debt"]
