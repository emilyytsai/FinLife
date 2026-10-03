"""Pydantic models for every shape in contracts/schema.md. Change them only together with the schema."""

from typing import Annotated, Any, Literal, Union

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
    ValidationInfo,
    field_validator,
    model_validator,
)
from pydantic_core import InitErrorDetails, PydanticCustomError

EVENT_TYPES = ("buy_house", "have_child", "job_loss", "set_retirement_pct", "new_debt")


class InputModel(BaseModel):
    """Request shapes reject unknown fields."""

    model_config = ConfigDict(extra="forbid")


# Profile


class Debt(InputModel):
    name: str = Field(min_length=1, max_length=40)
    balance: float = Field(ge=0)
    rate: float = Field(ge=0, le=0.4)
    min_payment: float = Field(ge=0)


class Assumptions(InputModel):
    investment_return: float = Field(ge=0, le=0.2)
    inflation: float = Field(ge=0, le=0.2)
    cash_yield: float = Field(ge=0, le=0.2)
    tax_rate: float = Field(ge=0, le=0.6)
    home_cost_pct: float = Field(ge=0, le=0.05)


class Profile(InputModel):
    age: int = Field(ge=18)
    retire_age: int = Field(le=75)
    income: float = Field(ge=0)
    salary_growth: float = Field(ge=0, le=0.2)
    cash: float = Field(ge=0)
    monthly_expenses: float = Field(ge=0)
    monthly_rent: float = Field(ge=0)
    retirement_balance: float = Field(ge=0)
    retirement_pct: float = Field(ge=0, le=1)
    employer_match_pct: float = Field(ge=0, le=1)
    debts: list[Debt] = Field(max_length=5)
    assumptions: Assumptions

    @field_validator("retire_age")
    @classmethod
    def retire_after_age(cls, retire_age: int, info: ValidationInfo) -> int:
        age = info.data.get("age")
        if age is not None and retire_age <= age:
            raise ValueError("Retirement age must be after current age")
        return retire_age


# Events. The optional id is made by the frontend; the engine ignores it and the API preserves it.


class BuyHouse(InputModel):
    type: Literal["buy_house"]
    age: int
    price: float = Field(ge=10000)
    down_pct: float = Field(ge=0, le=1)
    rate: float = Field(ge=0, le=0.2)
    years: int = Field(ge=1, le=40)
    id: str | None = None


class HaveChild(InputModel):
    type: Literal["have_child"]
    age: int
    annual_cost: float = Field(ge=0, le=100000)
    id: str | None = None


class JobLoss(InputModel):
    type: Literal["job_loss"]
    age: int
    months: int = Field(ge=1, le=12)
    id: str | None = None


class SetRetirementPct(InputModel):
    type: Literal["set_retirement_pct"]
    age: int
    pct: float = Field(ge=0, le=1)
    id: str | None = None


class NewDebt(InputModel):
    type: Literal["new_debt"]
    age: int
    name: str = Field(min_length=1, max_length=40)
    balance: float = Field(gt=0, le=1000000)
    rate: float = Field(ge=0, le=0.4)
    years: int = Field(ge=1, le=30)
    id: str | None = None


Event = Annotated[Union[BuyHouse, HaveChild, JobLoss, SetRetirementPct, NewDebt], Field(discriminator="type")]


# Engine output


class YearRow(BaseModel):
    age: int
    income: int
    expenses: int
    cash: int
    retirement: int
    home_equity: int
    debt: int
    net_worth: int


class Flag(BaseModel):
    age: int
    code: Literal["low_emergency_fund", "negative_cash", "savings_depleted"]
    message: str


class Summary(BaseModel):
    net_worth_at_retire: int
    retirement_at_retire: int
    min_cash: int
    min_cash_age: int


class Result(BaseModel):
    years: list[YearRow]
    flags: list[Flag]
    summary: Summary


class Diff(Summary):
    """scenario.summary minus baseline.summary, field by field."""


class Compare(BaseModel):
    baseline: Result
    scenario: Result
    diff: Diff


class Highlight(BaseModel):
    code: Literal["emergency_fund", "savings_rate", "debt_to_income", "retirement_pace"]
    tone: Literal["good", "watch", "alert"]
    text: str


class SuggestedScenario(BaseModel):
    prompt: str
    event: Event


class Analysis(BaseModel):
    savings_rate: float
    emergency_fund_months: float
    debt_to_income: float
    retirement_target: int
    retirement_projected: int
    retirement_ratio: float
    highlights: list[Highlight] = Field(min_length=4, max_length=4)
    suggested_scenarios: list[SuggestedScenario] = Field(min_length=3, max_length=3)


class DemoProfile(BaseModel):
    id: str
    name: str
    blurb: str
    profile: Profile


# Requests


def _error(loc: tuple, message: str, value: Any) -> InitErrorDetails:
    return InitErrorDetails(type=PydanticCustomError("finlife", message), loc=loc, input=value)


def _raise_if(problems: list[InitErrorDetails], title: str) -> None:
    if problems:
        raise ValidationError.from_exception_data(title, problems)


class AnalyzeRequest(InputModel):
    profile: Profile


class ScenarioRequest(InputModel):
    """A profile plus life events. Event ages and counts are checked against this profile."""

    profile: Profile
    events: list[Event] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def events_fit_profile(self):
        last = self.profile.retire_age - 1
        problems = []
        for i, event in enumerate(self.events):
            first = self._first_age(event)
            if not first <= event.age <= last:
                problems.append(_error(("events", i, "age"), f"Age must be between {first} and {last}", event.age))
        if sum(event.type == "buy_house" for event in self.events) > 1:
            problems.append(_error(("events",), "Only one home purchase is allowed", len(self.events)))
        _raise_if(problems, type(self).__name__)
        return self

    def _first_age(self, event) -> int:
        """Events start today, except a child the user already has: born up to 17 years ago, so still under 18."""
        return self.profile.age - 17 if event.type == "have_child" else self.profile.age


class SimulateRequest(ScenarioRequest):
    pass


class CompareRequest(ScenarioRequest):
    pass


class Message(InputModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class SessionRequest(ScenarioRequest):
    session_id: str = Field(min_length=1, max_length=100)
    messages: list[Message] = Field(default_factory=list)


class ChatRequest(SessionRequest):
    """Messages are oldest first and the last one is from the user."""

    messages: list[Message] = Field(min_length=1)

    @model_validator(mode="after")
    def last_message_from_user(self):
        if self.messages[-1].role != "user":
            problem = _error(("messages",), "The last message must be from the user", self.messages[-1].role)
            _raise_if([problem], type(self).__name__)
        return self


class ShareRequest(SessionRequest):
    pass


# Responses


class AnalyzeResponse(BaseModel):
    analysis: Analysis
    baseline: Result


class ChatResponse(BaseModel):
    reply: str
    events: list[Event]
    compare: Compare
    suggestions: list[str] = Field(max_length=2)
    status: Literal["ok", "blocked", "fallback", "stub"]


class ShareResponse(BaseModel):
    brief_id: str
    url: str


class Risk(BaseModel):
    age: int
    text: str


class Brief(BaseModel):
    id: str
    created_at: str
    profile: Profile
    events: list[Event]
    compare: Compare
    analysis: Analysis
    goals: list[str]
    tried: list[str]
    risks: list[Risk] = Field(max_length=4)
    questions: list[str] = Field(min_length=3, max_length=3)
    disclaimer: str


class HealthResponse(BaseModel):
    ok: bool
    stub_engine: bool
    stub_ai: bool


class FieldError(BaseModel):
    field: str
    message: str


class ErrorsResponse(BaseModel):
    errors: list[FieldError]


class ErrorResponse(BaseModel):
    error: str


# Helpers


def event_json_schema() -> dict:
    """JSON Schema for a list of Events with $defs inlined, ready for a tool's input_schema."""
    schema = TypeAdapter(list[Event]).json_schema()
    return _inline_refs(schema, schema.pop("$defs", {}))


def _inline_refs(node: Any, defs: dict) -> Any:
    if isinstance(node, dict):
        if "$ref" in node:
            return _inline_refs(defs[node["$ref"].rsplit("/", 1)[-1]], defs)
        # "discriminator" is OpenAPI-only and its mapping points at the removed $defs.
        return {key: _inline_refs(value, defs) for key, value in node.items() if key != "discriminator"}
    if isinstance(node, list):
        return [_inline_refs(item, defs) for item in node]
    return node


RATE_FIELDS = {
    "salary_growth",
    "retirement_pct",
    "employer_match_pct",
    "investment_return",
    "inflation",
    "cash_yield",
    "tax_rate",
    "home_cost_pct",
    "rate",
    "down_pct",
    "pct",
}
MONEY_FIELDS = {
    "income",
    "cash",
    "monthly_expenses",
    "monthly_rent",
    "retirement_balance",
    "balance",
    "min_payment",
    "price",
    "annual_cost",
}
LIMIT_MESSAGES = {
    "greater_than_equal": ("ge", "Must be at least {}"),
    "less_than_equal": ("le", "Must be at most {}"),
    "greater_than": ("gt", "Must be more than {}"),
    "less_than": ("lt", "Must be less than {}"),
}
TYPE_MESSAGES = {
    "missing": "This field is required",
    "int_type": "Must be a whole number",
    "int_parsing": "Must be a whole number",
    "int_from_float": "Must be a whole number",
    "float_type": "Must be a number",
    "float_parsing": "Must be a number",
    "string_type": "Must be text",
    "bool_type": "Must be true or false",
    "bool_parsing": "Must be true or false",
    "list_type": "Must be a list",
    "dict_type": "Must be an object",
    "model_type": "Must be an object",
    "model_attributes_type": "Must be an object",
    "json_invalid": "The request body isn't valid JSON",
    "union_tag_not_found": "Each event needs a type: " + ", ".join(EVENT_TYPES),
}


def friendly_errors(errors: list[dict]) -> list[dict]:
    """Turn Pydantic error dicts into [{"field", "message"}] with dotted paths and plain-English messages."""
    return [{"field": _field_path(error), "message": _message(error)} for error in errors]


def _field_path(error: dict) -> str:
    if error["type"] == "json_invalid":
        return "body"
    # Drop FastAPI's "body" prefix and the event-type tag Pydantic adds inside discriminated unions.
    parts = [str(part) for part in error["loc"] if part not in EVENT_TYPES]
    if parts[:1] == ["body"]:
        parts = parts[1:]
    return ".".join(parts) or "body"


def _message(error: dict) -> str:
    kind, ctx = error["type"], error.get("ctx") or {}
    field = next((part for part in reversed(error["loc"]) if isinstance(part, str)), "")
    if kind == "finlife":
        return error["msg"]
    if kind == "value_error":
        return str(ctx["error"]) if "error" in ctx else error["msg"].removeprefix("Value error, ")
    if kind == "extra_forbidden":
        return f"Unknown field '{field}'"
    if kind in LIMIT_MESSAGES:
        key, template = LIMIT_MESSAGES[kind]
        return template.format(_amount(field, ctx[key]))
    if kind == "string_too_short":
        return "Can't be empty" if ctx["min_length"] == 1 else f"Must be at least {ctx['min_length']} characters"
    if kind == "string_too_long":
        return f"Must be {ctx['max_length']} characters or fewer"
    if kind == "too_long":
        return f"You can have at most {ctx['max_length']} {field or 'items'}"
    if kind == "too_short":
        return "Can't be empty" if ctx["min_length"] == 1 else f"Needs at least {ctx['min_length']} {field or 'items'}"
    if kind == "union_tag_invalid":
        return f"Unknown event type '{ctx['tag']}'. Use one of: " + ", ".join(EVENT_TYPES)
    if kind == "literal_error":
        return f"Must be {ctx['expected']}"
    return TYPE_MESSAGES.get(kind, error["msg"])


def _amount(field: str, value: float) -> str:
    """Show a limit the way the user enters it: rates as percents, money with $ and commas."""
    if field in RATE_FIELDS:
        return f"{value * 100:g}%"
    if field in MONEY_FIELDS:
        return f"${value:,.0f}"
    return f"{value:,.0f}" if float(value).is_integer() else f"{value:g}"
