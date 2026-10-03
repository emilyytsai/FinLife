"""Shape-correct placeholder output, used whenever the engine raises NotImplementedError. Numbers are obviously fake.

The *_or_stub helpers call the real engine first, so each route switches over automatically as Kevin lands it.
"""

import math
from collections.abc import Callable, Generator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

import engine

# Per-request holder set by main.py's middleware, which adds X-FinLife-Stub: 1 when a stub was used.
_stub_used: ContextVar[dict | None] = ContextVar("finlife_stub_used", default=None)


@contextmanager
def track_stubs() -> Generator[dict, None, None]:
    holder = {"used": False}
    token = _stub_used.set(holder)
    try:
        yield holder
    finally:
        _stub_used.reset(token)


def mark_stub() -> None:
    holder = _stub_used.get()
    if holder is not None:
        holder["used"] = True


def run_or_stub(real: Callable, placeholder: Callable, *args: Any) -> Any:
    try:
        return real(*args)
    except NotImplementedError:
        mark_stub()
        return placeholder(*args)


def simulate_or_stub(profile: dict, events: list[dict]) -> dict:
    return run_or_stub(engine.simulate, placeholder_simulate, profile, events)


def compare_or_stub(profile: dict, events: list[dict]) -> dict:
    return run_or_stub(engine.compare, placeholder_compare, profile, events)


def analyze_or_stub(profile: dict) -> dict:
    return run_or_stub(engine.analyze, placeholder_analysis, profile)


def money_or_stub(x: float) -> str:
    return run_or_stub(engine.money, placeholder_money, x)


def label_or_stub(event: dict) -> str:
    return run_or_stub(engine.label, placeholder_label, event)


def engine_is_stub(profile: dict) -> bool:
    """True while any engine function still raises NotImplementedError."""
    event = {"type": "job_loss", "age": profile["age"], "months": 6}
    probes = (
        lambda: engine.simulate(profile, []),
        lambda: engine.compare(profile, [event]),
        lambda: engine.analyze(profile),
        lambda: engine.money(1250),
        lambda: engine.label(event),
    )
    for probe in probes:
        try:
            probe()
        except NotImplementedError:
            return True
    return False


# Placeholders


def placeholder_simulate(profile: dict, events: list[dict]) -> dict:
    total_debt = sum(debt["balance"] for debt in profile["debts"])
    rows = []
    retire_age = profile["retire_age"]
    for age in range(profile["age"], max(retire_age, engine.PLAN_TO_AGE) + 1):
        n = age - profile["age"]
        working = min(age, retire_age) - profile["age"]  # years of saving so far
        retired_years = max(0, age - retire_age)
        events_so_far = sum(1 for event in events if event["age"] <= age)
        cash = profile["cash"] + 2000 * working - 15000 * events_so_far
        retirement = max(0, profile["retirement_balance"] + 4000 * working - 6000 * retired_years)
        debt = max(0, total_debt - 3000 * n)
        row = {
            "age": age,
            "income": 0 if age >= retire_age else profile["income"] * 1.03**n,
            "expenses": (profile["monthly_expenses"] + profile["monthly_rent"]) * 12 * 1.03**n,
            "cash": cash,
            "retirement": retirement,
            "home_equity": 0,
            "debt": debt,
            "net_worth": cash + retirement - debt,
        }
        rows.append({key: round(value) for key, value in row.items()})
    return {"years": rows, "flags": _placeholder_flags(rows), "summary": _summary(rows, retire_age)}


def placeholder_compare(profile: dict, events: list[dict]) -> dict:
    baseline = simulate_or_stub(profile, [])
    scenario = simulate_or_stub(profile, events)
    diff = {key: scenario["summary"][key] - baseline["summary"][key] for key in baseline["summary"]}
    return {"baseline": baseline, "scenario": scenario, "diff": diff}


def placeholder_analysis(profile: dict) -> dict:
    retire_age = profile["retire_age"]
    return {
        "savings_rate": 0.111,
        "emergency_fund_months": 1.1,
        "debt_to_income": 0.111,
        "retirement_target": 1111000,
        "retirement_projected": 111000,
        "retirement_ratio": 0.1,
        "highlights": [
            {"code": "emergency_fund", "tone": "alert", "text": "Cash covers 1.1 months of expenses."},
            {"code": "savings_rate", "tone": "watch", "text": "You save 11% of your income, including your 401(k)."},
            {"code": "debt_to_income", "tone": "good", "text": "Debt payments take 11% of your income."},
            {
                "code": "retirement_pace",
                "tone": "alert",
                "text": f"You're on pace for 10% of a common retirement benchmark (25x yearly expenses at {retire_age}).",
            },
        ],
        "suggested_scenarios": _suggested_scenarios(profile),
    }


def placeholder_money(x: float) -> str:
    """Rough stand-in for engine.money; only stub output uses it."""
    sign, x = ("-" if x < 0 else ""), abs(x)
    if x >= 1_000_000:
        return f"{sign}${x / 1_000_000:.1f}M".replace(".0M", "M")
    if x >= 10_000:
        return f"{sign}${x / 1000:.0f}k"
    return f"{sign}${x:,.0f}"


def placeholder_label(event: dict) -> str:
    return f"{event['type']} at {event['age']}"


def _placeholder_flags(rows: list[dict]) -> list[dict]:
    for row in rows:
        if row["cash"] < 0:
            message = f"Cash falls to {money_or_stub(row['cash'])}"
            return [{"age": row["age"], "code": "negative_cash", "message": message}]
    return []


def _summary(rows: list[dict], retire_age: int) -> dict:
    """Like the engine: the retire_age row, and the lowest cash in the working years."""
    working = [row for row in rows if row["age"] <= retire_age]
    last = working[-1]
    lowest = min(working, key=lambda row: row["cash"])  # min keeps the first, so this is the earliest age
    return {
        "net_worth_at_retire": last["net_worth"],
        "retirement_at_retire": last["retirement"],
        "min_cash": lowest["cash"],
        "min_cash_age": lowest["age"],
    }


def _suggested_scenarios(profile: dict) -> list[dict]:
    """The schema's suggested_scenarios rules, so stub prompts look like the real ones."""
    age, last_age = profile["age"], profile["retire_age"] - 1
    house_age, soon = min(age + 6, last_age), min(age + 3, last_age)
    price = max(50_000, math.floor(profile["income"] * 6 / 10_000 + 0.5) * 10_000)
    scenarios = [
        {
            "prompt": f"What if I buy a {money_or_stub(price)} house at {house_age}?",
            "event": {"type": "buy_house", "age": house_age, "price": price, "down_pct": 0.10, "rate": 0.065, "years": 30},
        },
        {
            "prompt": f"What if I lose my job for 6 months at {soon}?",
            "event": {"type": "job_loss", "age": soon, "months": 6},
        },
    ]
    if profile["retirement_pct"] < 0.15:
        pct = round(min(profile["retirement_pct"] + 0.05, 0.15), 4)
        scenarios.append(
            {
                "prompt": f"What if I raise my 401(k) to {_percent(pct)}% at {soon}?",
                "event": {"type": "set_retirement_pct", "age": soon, "pct": pct},
            }
        )
    else:
        child_age = min(age + 8, last_age)
        scenarios.append(
            {
                "prompt": f"What if I have a child at {child_age}?",
                "event": {"type": "have_child", "age": child_age, "annual_cost": 15000},
            }
        )
    return scenarios


def _percent(rate: float) -> str:
    value = round(rate * 100, 1)
    return str(int(value)) if value.is_integer() else str(value)
