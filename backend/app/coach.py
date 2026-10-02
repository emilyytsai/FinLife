"""The what-if coach. Phase 0 only has canned stub replies; Brian adds the Bedrock tool loop in B1."""

from dataclasses import dataclass, field

from app.stubs import label_or_stub, mark_stub

ADDED_REPLY = "Added: {label}. The real coach isn't connected yet, so this is a placeholder explanation."
UNCHANGED_REPLY = "The coach isn't connected yet (stub). I got your question and left your plan unchanged."


@dataclass
class CoachResult:
    reply: str
    events: list[dict]
    tool_calls: list[dict] = field(default_factory=list)
    model_id: str = "stub"
    number_check: str = "skipped"
    status: str = "stub"


def run_coach(profile: dict, events: list[dict], messages: list[dict], analysis: dict) -> CoachResult:
    """Answer the latest user message. Phase 0 always uses stub_coach (Brian replaces this in B1)."""
    return stub_coach(profile, events, messages, analysis)


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
