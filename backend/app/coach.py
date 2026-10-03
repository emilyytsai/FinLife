"""The what-if coach: Claude on Bedrock turns the question into events with one tool, the engine computes every
number, and the number check keeps the reply honest. stub_coach answers when settings.stub_ai is on."""

import json
import logging
import time
from dataclasses import dataclass, field
from functools import lru_cache

import anthropic
from anthropic import AnthropicBedrock
from pydantic import ValidationError

from app import pacing
from app.config import get_settings
from app.models import ScenarioRequest, event_json_schema, friendly_errors
from app.numbers import allowed_numbers, unsupported_numbers
from app.stubs import compare_or_stub, label_or_stub, mark_stub, money_or_stub

logger = logging.getLogger("finlife.coach")

ADDED_REPLY = "Added: {label}. The real coach isn't connected yet, so this is a placeholder explanation."
UNCHANGED_REPLY = "The coach isn't connected yet (stub). I got your question and left your plan unchanged."

MAX_TOKENS = 600
MAX_TOOL_ROUNDS = 3
THROTTLE_WAIT_SECONDS = 2
REQUEST_TIMEOUT_SECONDS = 25
NUMBERS_CORRECTION = (
    "These numbers don't match the simulation: {numbers}. Rewrite using only numbers from the tool result."
)

SYSTEM_PROMPT = """You are the FinLife coach. You help a young adult explore "what if" questions about their own financial life using a simulation engine.

How you work:
- To change the scenario, call set_events with the FULL list of events. Keep existing events unless the user removes or changes them. Then explain the result.
- Every number you mention must come from the tool result, the profile, or the events. Never calculate, estimate, or convert numbers yourself.
- If a detail is missing, use these defaults and say so in a short clause: house price from the suggested scenarios, 10% down, 6.5% rate, 30 years; child $15k a year; job loss 6 months; car loan 7% over 5 years.
- Write dollar amounts the way the tool result's labels do ($350k, $1.2M).
- When you use a tool, you may say a brief sentence first. If no tool can express what the user asked for, say so instead of guessing. Do not include internal or system XML tags in your response.

How you write:
- First sentence: the direct answer.
- Then up to 3 short sentences with the key numbers (ages and dollar amounts).
- End with one short sentence on the biggest tradeoff.
- 80 words maximum. Plain text. No headings, bullet lists, or tables.
- Warm and plain. No jargon, no shaming, no exclamation points.

Boundaries:
- You do not give investment, tax, or legal advice. Never recommend specific securities, funds, products, account types, providers, trades, or allocations. If asked, say you can't recommend investments, that a licensed adviser can help, and offer a scenario you can run instead.
- If the question isn't about their plan, briefly steer back to it.
- Never ask for or repeat names, account numbers, or other identifying details."""

SET_EVENTS_TOOL = {
    "name": "set_events",
    "description": (
        "Replace the scenario with this full list of life events and run the simulation. "
        "Include every event that should stay. Returns the result compared with the user's current path."
    ),
    "input_schema": {"type": "object", "properties": {"events": event_json_schema()}, "required": ["events"]},
}


class CoachBusy(Exception):
    """Bedrock failed on the main model and the fallback. /chat answers 503."""

    def __init__(self, model_id: str, tool_calls: list[dict]):
        super().__init__(f"Bedrock unavailable (last model {model_id})")
        self.model_id = model_id
        self.tool_calls = tool_calls


@dataclass
class CoachResult:
    reply: str
    events: list[dict]
    tool_calls: list[dict] = field(default_factory=list)
    model_id: str = "stub"
    number_check: str = "skipped"
    status: str = "stub"
    latency_ms: int = 0
    model_calls: int = 0


def run_coach(profile: dict, events: list[dict], messages: list[dict], analysis: dict) -> CoachResult:
    """Answer the latest user message: Claude on Bedrock, or stub_coach when settings.stub_ai is on."""
    if get_settings().stub_ai:
        return stub_coach(profile, events, messages, analysis)
    return CoachTurn(profile, events, analysis).run(messages)


@lru_cache
def bedrock_client() -> AnthropicBedrock:
    """One client per process. It keeps the credentials it loaded: after refreshing the finlife profile, restart."""
    settings = get_settings()
    return AnthropicBedrock(
        aws_region=settings.aws_region,
        aws_profile=settings.aws_client_profile,
        max_retries=0,  # the account allows ~1 call/s; Bedrock calls below handle throttling themselves
        timeout=REQUEST_TIMEOUT_SECONDS,
    )


class BedrockModel:
    """Paced model calls. If a call fails, retry it once on the fallback model and keep that model for the turn."""

    def __init__(self, model_id: str | None = None):
        settings = get_settings()
        self.model_id = model_id or settings.bedrock_model_id
        self.fallback_id = settings.bedrock_fallback_model_id
        self.calls = 0

    def create(self, **request) -> anthropic.types.Message:
        try:
            return self._send(request)
        except anthropic.AnthropicError as error:
            if not self.fallback_id or self.model_id == self.fallback_id:
                raise
            logger.warning(
                "Bedrock call failed on %s (%s); retrying on the fallback model", self.model_id, type(error).__name__
            )
            if isinstance(error, anthropic.RateLimitError):
                time.sleep(THROTTLE_WAIT_SECONDS)
            self.model_id = self.fallback_id
        return self._send(request)

    def _send(self, request: dict) -> anthropic.types.Message:
        pacing.pace()
        self.calls += 1
        return bedrock_client().messages.create(
            model=self.model_id,
            max_tokens=MAX_TOKENS,
            thinking={"type": "disabled"},  # short replies; thinking would compete with them for the 600 tokens
            **request,
        )


class CoachTurn:
    """One /chat turn: the tool loop, the number check, and the fallback template."""

    def __init__(self, profile: dict, events: list[dict], analysis: dict):
        self.profile = profile
        self.events = events
        self.analysis = analysis
        self.model = BedrockModel()
        self.scenario_events = list(events)
        self.tool_calls: list[dict] = []
        self.tool_outputs: list[dict] = []
        self.current = _compare_summary(compare_or_stub(profile, events))
        self.system = self._system_prompt()

    def run(self, messages: list[dict]) -> CoachResult:
        started = time.perf_counter()
        conversation = _model_messages(messages)
        try:
            response = self._tool_loop(conversation)
            reply, number_check = self._checked_reply(response, conversation)
        except anthropic.AnthropicError as error:
            logger.error("Coach unavailable on %s: %s", self.model.model_id, type(error).__name__)
            raise CoachBusy(self.model.model_id, self.tool_calls) from error
        latency_ms = round((time.perf_counter() - started) * 1000)
        logger.info(
            "coach model=%s calls=%d tool_calls=%d number_check=%s latency_ms=%d",
            self.model.model_id,
            self.model.calls,
            len(self.tool_calls),
            number_check,
            latency_ms,
        )
        return CoachResult(
            reply=reply,
            events=self.scenario_events,
            tool_calls=self.tool_calls,
            model_id=self.model.model_id,
            number_check=number_check,
            status="fallback" if number_check == "fallback" else "ok",
            latency_ms=latency_ms,
            model_calls=self.model.calls,
        )

    def _ask(self, conversation: list[dict], **extra) -> anthropic.types.Message:
        return self.model.create(system=self.system, tools=[SET_EVENTS_TOOL], messages=conversation, **extra)

    def _system_prompt(self) -> str:
        context = {
            "profile": self.profile,
            "events": [{**event, "label": label_or_stub(event)} for event in self.events],
            "analysis": self.analysis,
            "current_compare": self.current,
        }
        return f"{SYSTEM_PROMPT}\n\n## Context\n{_compact_json(context)}"

    def _tool_loop(self, conversation: list[dict]) -> anthropic.types.Message:
        response = self._ask(conversation)
        for _ in range(MAX_TOOL_ROUNDS):
            if response.stop_reason != "tool_use":
                break
            results = [self._run_tool(block) for block in response.content if block.type == "tool_use"]
            conversation += [{"role": "assistant", "content": response.content}, {"role": "user", "content": results}]
            response = self._ask(conversation)
        return response

    def _run_tool(self, block) -> dict:
        """Validate the events like a request would; the model gets plain error text so it can fix them."""
        result = {"type": "tool_result", "tool_use_id": block.id}
        try:
            request = ScenarioRequest.model_validate({"profile": self.profile, "events": block.input.get("events")})
        except ValidationError as error:
            self.tool_calls.append({"name": block.name, "input": block.input, "is_error": True})
            problems = "; ".join(f"{e['field']}: {e['message']}" for e in friendly_errors(error.errors()))
            return {**result, "content": problems, "is_error": True}
        self.tool_calls.append({"name": block.name, "input": block.input, "is_error": False})
        self.scenario_events = _keep_ids(self.events, [event.model_dump(exclude_none=True) for event in request.events])
        output = self._tool_output(self.scenario_events)
        self.tool_outputs.append(output)
        return {**result, "content": _compact_json(output)}

    def _tool_output(self, events: list[dict]) -> dict:
        compare = compare_or_stub(self.profile, events)
        ages = {event["age"] for event in events} | {self.profile["retire_age"]}
        return {
            "events": [label_or_stub(event) for event in events],
            **_compare_summary(compare),
            "rows": [row for row in compare["scenario"]["years"] if row["age"] in ages],
        }

    def _checked_reply(self, response, conversation: list[dict]) -> tuple[str, str]:
        """Return (reply, number_check). One rewrite if the numbers don't match, then the template."""
        allowed = allowed_numbers(
            self.profile, self.events, self.analysis, self.current, self.scenario_events, self.tool_outputs
        )
        reply = _final_text(response)
        if reply is None:
            return self._template_reply(), "fallback"
        unsupported = unsupported_numbers(reply, allowed)
        if not unsupported:
            return reply, "pass"
        correction = NUMBERS_CORRECTION.format(numbers=", ".join(unsupported))
        conversation += [{"role": "assistant", "content": response.content}, {"role": "user", "content": correction}]
        try:
            reply = _final_text(self._ask(conversation, tool_choice={"type": "none"}))
        except anthropic.AnthropicError as error:
            # The scenario already ran, so the engine's numbers can still answer.
            logger.warning("Number check rewrite failed (%s); using the template reply", type(error).__name__)
            return self._template_reply(), "fallback"
        if reply is not None and not unsupported_numbers(reply, allowed):
            return reply, "retried"
        logger.warning("Number check failed twice; using the template reply")
        return self._template_reply(), "fallback"

    def _template_reply(self) -> str:
        """A plain reply built only from engine output, for when the model's reply can't be used."""
        compare = compare_or_stub(self.profile, self.scenario_events)
        baseline, scenario = compare["baseline"]["summary"], compare["scenario"]["summary"]
        retire_age = self.profile["retire_age"]
        current_path = money_or_stub(baseline["net_worth_at_retire"])
        if self.scenario_events:
            changed = money_or_stub(scenario["net_worth_at_retire"])
            first = (
                f"With your changes, your net worth at {retire_age} would be {changed}, "
                f"compared with {current_path} on your current path."
            )
        else:
            first = f"On your current path, your net worth at {retire_age} would be {current_path}."
        lowest = f"Your cash is lowest at {money_or_stub(scenario['min_cash'])} at age {scenario['min_cash_age']}."
        sentences = [first, lowest]
        if flags := compare["scenario"]["flags"]:
            sentences.append(f"At {flags[0]['age']}: {flags[0]['message']}.")
        return " ".join(sentences)


def stub_coach(profile: dict, events: list[dict], messages: list[dict], analysis: dict) -> CoachResult:
    """A suggested-scenario prompt adds its event; anything else leaves the plan unchanged."""
    mark_stub()
    question = messages[-1]["content"].strip()
    match = next((s for s in analysis["suggested_scenarios"] if s["prompt"] == question), None)
    if match is None or not _can_add(events, match["event"]):
        return CoachResult(reply=UNCHANGED_REPLY, events=list(events))
    event = dict(match["event"])
    return CoachResult(reply=ADDED_REPLY.format(label=label_or_stub(event)), events=[*events, event])


def _can_add(events: list[dict], event: dict) -> bool:
    """Stay inside the schema's event limits: at most 10 events and one buy_house."""
    if len(events) >= 10:
        return False
    return not (event["type"] == "buy_house" and any(e["type"] == "buy_house" for e in events))


def _model_messages(messages: list[dict]) -> list[dict]:
    """The model's conversation must start with the user, so leading assistant messages (a greeting) are dropped."""
    first_user = next(i for i, message in enumerate(messages) if message["role"] == "user")
    return [{"role": message["role"], "content": message["content"]} for message in messages[first_user:]]


def _compare_summary(compare: dict) -> dict:
    return {
        "baseline": compare["baseline"]["summary"],
        "scenario": compare["scenario"]["summary"],
        "diff": compare["diff"],
        "flags": compare["scenario"]["flags"],
    }


def _keep_ids(old_events: list[dict], new_events: list[dict]) -> list[dict]:
    """Existing ids survive: one the model echoed back, or the id of an identical event. New events get none."""
    free = {event["id"]: _without_id(event) for event in old_events if event.get("id")}
    kept = []
    for event in new_events:
        bare = _without_id(event)
        event_id = event.get("id")
        if event_id not in free:
            event_id = next((known_id for known_id, known in free.items() if known == bare), None)
        if event_id is not None:
            del free[event_id]
            bare["id"] = event_id
        kept.append(bare)
    return kept


def _without_id(event: dict) -> dict:
    return {key: value for key, value in event.items() if key != "id"}


def _final_text(response) -> str | None:
    """The reply text, or None when the model didn't finish normally (still calling tools, cut off, or refused)."""
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    return text if response.stop_reason == "end_turn" and text else None


def _compact_json(value) -> str:
    return json.dumps(value, separators=(",", ":"))
