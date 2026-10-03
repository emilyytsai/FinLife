"""The one-page advisor brief. Haiku 4.5 on Bedrock writes the risks and questions; the flag-based risks and fixed
questions stand in for any part of its output that can't be used."""

import json
import logging
import secrets
import string
import time
from datetime import datetime, timezone
from typing import Annotated

import anthropic
from pydantic import BaseModel, Field, ValidationError

from app.coach import BedrockModel
from app.config import get_settings
from app.guardrail import check_output
from app.numbers import allowed_numbers, unsupported_numbers
from app.stubs import analyze_or_stub, compare_or_stub, label_or_stub, mark_stub

logger = logging.getLogger("finlife.brief")

DISCLAIMER = "Client-entered data, not verified. For education only. Not financial advice."
FALLBACK_QUESTIONS = [
    "Which of these goals matters most to you in the next five years?",
    "How stable do you expect your income to be over the next few years?",
    "How would you handle a large unexpected expense today?",
]
GOAL_TYPES = {"buy_house", "have_child", "new_debt"}
TRIED_TYPES = {"job_loss", "set_retirement_pct"}
TTL_SECONDS = 30 * 24 * 60 * 60
ID_ALPHABET = string.ascii_lowercase + string.digits

BRIEF_PROMPT = (
    "You write a short brief for a financial advisor about a prospective client's own planning session. "
    "Use only numbers that appear in the data provided. "
    'Return JSON only, with keys "risks" (a list of at most 4 objects with "age" and "text") and "questions" '
    "(exactly 3 questions the advisor could ask in a first meeting). Plain English, one sentence each. "
    "Never recommend investments, funds, products, or trades."
)
RETRY_MESSAGE = (
    "That reply couldn't be used ({problem}). Return JSON only, with \"risks\" (at most 4 objects with \"age\" "
    'and "text") and "questions" (exactly 3 questions).'
)

# Structured output: Bedrock always returns JSON in this shape. The counts (at most 4 risks, exactly 3 questions)
# can't be expressed here, so Draft still checks them.
DRAFT_SCHEMA = {
    "type": "object",
    "properties": {
        "risks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"age": {"type": "integer"}, "text": {"type": "string"}},
                "required": ["age", "text"],
                "additionalProperties": False,
            },
        },
        "questions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["risks", "questions"],
    "additionalProperties": False,
}

Sentence = Annotated[str, Field(min_length=1)]


class DraftRisk(BaseModel):
    age: int
    text: Sentence


class Draft(BaseModel):
    """The JSON the model must return."""

    risks: list[DraftRisk] = Field(max_length=4)
    questions: list[Sentence] = Field(min_length=3, max_length=3)


def build_brief(profile: dict, events: list[dict], messages: list[dict]) -> dict:
    compare = compare_or_stub(profile, events)
    analysis = analyze_or_stub(profile)
    risks, questions = write_risks_and_questions(compare, analysis, [label_or_stub(event) for event in events])
    created = datetime.now(timezone.utc).replace(microsecond=0)
    return {
        "id": "".join(secrets.choice(ID_ALPHABET) for _ in range(8)),
        "created_at": created.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "profile": profile,
        "events": events,
        "compare": compare,
        "analysis": analysis,
        "goals": [label_or_stub(event) for event in events if event["type"] in GOAL_TYPES],
        "tried": [label_or_stub(event) for event in events if event["type"] in TRIED_TYPES],
        "risks": risks,
        "questions": questions,
        "disclaimer": DISCLAIMER,
        "expires_at": int(created.timestamp()) + TTL_SECONDS,
    }


def write_risks_and_questions(compare: dict, analysis: dict, labels: list[str]) -> tuple[list[dict], list[str]]:
    """Model-written risks and questions that pass the number check and the guardrail, else the fallbacks."""
    flag_risks = [{"age": flag["age"], "text": flag["message"]} for flag in compare["scenario"]["flags"]][:4]
    fallback = flag_risks, list(FALLBACK_QUESTIONS)
    if get_settings().stub_ai:
        mark_stub()
        return fallback
    started = time.perf_counter()
    data = {
        "events": labels,
        "baseline": compare["baseline"]["summary"],
        "scenario": compare["scenario"]["summary"],
        "diff": compare["diff"],
        "flags": compare["scenario"]["flags"],
        "analysis": analysis,
    }
    model = BedrockModel(get_settings().bedrock_fallback_model_id)
    draft = _ask_for_draft(model, data)
    if draft is None:
        return fallback
    allowed = allowed_numbers(data)
    kept = [risk.model_dump() for risk in draft.risks if not unsupported_numbers(risk.text, allowed)]
    risks = kept or flag_risks
    questions = [
        spare if unsupported_numbers(question, allowed) else question
        for question, spare in zip(draft.questions, FALLBACK_QUESTIONS)
    ]
    _, guardrail_action = check_output("\n".join([risk["text"] for risk in risks] + questions))
    logger.info(
        "brief model=%s calls=%d risks_kept=%d/%d guardrail=%s latency_ms=%d",
        model.model_id,
        model.calls,
        len(kept),
        len(draft.risks),
        guardrail_action,
        round((time.perf_counter() - started) * 1000),
    )
    if guardrail_action == "GUARDRAIL_INTERVENED":
        return fallback
    return risks, questions


def _ask_for_draft(model: BedrockModel, data: dict) -> Draft | None:
    """One call, and one retry if the reply isn't the JSON asked for. None if that fails or Bedrock errors."""
    conversation = [{"role": "user", "content": json.dumps(data, separators=(",", ":"))}]

    def ask() -> str:
        output_config = {"format": {"type": "json_schema", "schema": DRAFT_SCHEMA}}
        return _text(model.create(system=BRIEF_PROMPT, messages=conversation, output_config=output_config))

    try:
        reply = ask()
        draft, problem = _parse_draft(reply)
        if draft is None:
            logger.warning("Brief JSON invalid (%s); retrying once", problem)
            conversation += [
                {"role": "assistant", "content": reply or "(no reply)"},
                {"role": "user", "content": RETRY_MESSAGE.format(problem=problem)},
            ]
            draft, problem = _parse_draft(ask())
    except anthropic.AnthropicError as error:
        logger.warning("Brief model call failed on %s (%s); using the fallbacks", model.model_id, type(error).__name__)
        return None
    if draft is None:
        logger.warning("Brief JSON invalid twice (%s); using the fallbacks", problem)
    return draft


def _parse_draft(reply: str) -> tuple[Draft | None, str]:
    """(draft, "") or (None, what was wrong). Code fences or prose around the JSON object are ignored."""
    start, end = reply.find("{"), reply.rfind("}")
    candidate = reply[start : end + 1] if 0 <= start < end else reply
    try:
        return Draft.model_validate_json(candidate), ""
    except ValidationError as error:
        problems = [
            f"{'.'.join(str(part) for part in e['loc'])}: {e['msg']}" if e["loc"] else e["msg"]
            for e in error.errors()[:3]
        ]
        return None, "; ".join(problems)


def _text(response: anthropic.types.Message) -> str:
    return "".join(block.text for block in response.content if block.type == "text").strip()
