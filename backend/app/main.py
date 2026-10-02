"""FinLife API. Routes follow contracts/schema.md; engine calls fall back to stubs.py until Kevin lands them."""

import json
import logging
import time
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import stubs
from app.brief import build_brief
from app.coach import run_coach
from app.config import BACKEND_DIR, get_settings
from app.guardrail import check_output
from app.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    Brief,
    ChatRequest,
    ChatResponse,
    Compare,
    CompareRequest,
    DemoProfile,
    HealthResponse,
    Profile,
    Result,
    ScenarioRequest,
    ShareRequest,
    ShareResponse,
    SimulateRequest,
    friendly_errors,
)
from app.store import get_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("finlife")
logger.setLevel(logging.INFO)

MAX_MODEL_MESSAGES = 20
SERVER_ERROR = {"error": "Something went wrong"}

app = FastAPI(title="FinLife API")


class BriefNotFound(Exception):
    pass


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """One log line per request (never profile values). Adds X-FinLife-Stub: 1 when a stub produced the response."""
    started = time.perf_counter()
    with stubs.track_stubs() as stub:
        try:
            response = await call_next(request)
        except Exception:
            # Handled here, inside CORSMiddleware, so the browser can still read the 500 body.
            logger.exception("Unhandled error on %s", request.url.path)
            response = JSONResponse(status_code=500, content=SERVER_ERROR)
    if stub["used"]:
        response.headers["X-FinLife-Stub"] = "1"
    latency_ms = round((time.perf_counter() - started) * 1000)
    logger.info(
        "%s %s status=%s latency_ms=%s stub=%d",
        request.method,
        request.url.path,
        response.status_code,
        latency_ms,
        stub["used"],
    )
    return response


# Added last so it wraps everything, including the 500s above. Never also configure CORS on the Function URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins_list,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["X-FinLife-Stub"],
)


@app.exception_handler(RequestValidationError)
@app.exception_handler(ValidationError)
async def validation_error(request: Request, exc: RequestValidationError | ValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"errors": friendly_errors(exc.errors())})


@app.exception_handler(BriefNotFound)
async def brief_not_found(request: Request, exc: BriefNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "Brief not found"})


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)}, headers=exc.headers)


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content=SERVER_ERROR)


def load_profiles() -> list[dict]:
    return json.loads((BACKEND_DIR / "fixtures" / "profiles.json").read_text(encoding="utf-8"))


def plain(body: ScenarioRequest) -> tuple[dict, list[dict]]:
    """The plain dicts the engine expects. Events keep their id only when they have one."""
    return body.profile.model_dump(), [event.model_dump(exclude_none=True) for event in body.events]


def suggestions_for(analysis: dict, events: list[dict]) -> list[str]:
    """Up to 2 suggested prompts whose event type isn't already in the plan."""
    used = {event["type"] for event in events}
    return [s["prompt"] for s in analysis["suggested_scenarios"] if s["event"]["type"] not in used][:2]


def now_iso_ms() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def write_audit(record: dict) -> None:
    """A failed audit write is logged and never breaks the reply."""
    try:
        get_store().write_audit(record)
    except Exception:
        logger.exception("Audit write failed")


@app.get("/health", response_model=HealthResponse)
def health():
    sample = Profile.model_validate(load_profiles()[0]["profile"]).model_dump()  # any persona works as a probe
    return {"ok": True, "stub_engine": stubs.engine_is_stub(sample), "stub_ai": get_settings().stub_ai}


@app.get("/profiles", response_model=list[DemoProfile])
def profiles():
    return load_profiles()


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(body: AnalyzeRequest):
    profile = body.profile.model_dump()
    return {"analysis": stubs.analyze_or_stub(profile), "baseline": stubs.simulate_or_stub(profile, [])}


@app.post("/simulate", response_model=Result)
def simulate(body: SimulateRequest):
    return stubs.simulate_or_stub(*plain(body))


@app.post("/compare", response_model=Compare)
def compare(body: CompareRequest):
    return stubs.compare_or_stub(*plain(body))


@app.post("/chat", response_model=ChatResponse, response_model_exclude_none=True)
def chat(body: ChatRequest):
    started = time.perf_counter()
    profile, events = plain(body)
    messages = [message.model_dump() for message in body.messages][-MAX_MODEL_MESSAGES:]
    analysis = stubs.analyze_or_stub(profile)
    result = run_coach(profile, events, messages, analysis)
    reply, guardrail_action = check_output(result.reply)
    status = "blocked" if guardrail_action == "GUARDRAIL_INTERVENED" else result.status
    response = {
        "reply": reply,
        "events": result.events,
        "compare": stubs.compare_or_stub(profile, result.events),
        "suggestions": suggestions_for(analysis, result.events),
        "status": status,
    }
    write_audit(
        {
            "session_id": body.session_id,
            "ts": now_iso_ms(),
            "request": {"profile": profile, "events": events, "last_user_message": messages[-1]["content"]},
            "tool_calls": result.tool_calls,
            "reply": reply,
            "status": status,
            "model_id": result.model_id,
            "guardrail_action": guardrail_action,
            "number_check": result.number_check,
            "latency_ms": round((time.perf_counter() - started) * 1000),
        }
    )
    return response


@app.post("/share", response_model=ShareResponse)
def share(body: ShareRequest):
    profile, events = plain(body)
    brief = build_brief(profile, events, [message.model_dump() for message in body.messages])
    get_store().save_brief(brief)
    frontend_url = get_settings().frontend_url.rstrip("/")
    return {"brief_id": brief["id"], "url": f"{frontend_url}/brief/?id={brief['id']}"}


@app.get("/brief/{brief_id}", response_model=Brief, response_model_exclude_none=True)
def get_brief(brief_id: str):
    brief = get_store().get_brief(brief_id)
    if brief is None:
        raise BriefNotFound()
    brief.pop("expires_at", None)
    return brief
