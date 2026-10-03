"""Health check and suggested scenarios. Kevin implements this in K3."""

from .labels import money
from .simulate import _year_zero_flows, simulate


def _round3(x: float) -> float:
    """Round to three decimals (metrics that the schema specifies to three decimals)."""
    return round(x, 3)


def _whole_percent(ratio: float) -> int:
    """The whole-number percent shown in highlight text, e.g. 0.149 -> 15."""
    return round(ratio * 100)


def _pct_label(ratio: float) -> str:
    """Percent for a prompt: whole number normally, one decimal when not whole (0.075 -> '7.5')."""
    value = round(ratio * 1000) / 10
    return str(int(value)) if value == int(value) else str(value)


def analyze(profile: dict) -> dict:
    """Return a dict shaped like Analysis, computed from the no-event baseline.

    See contracts/schema.md "Analysis rules". "Year 0" means the flows at profile.age.
    """
    baseline = simulate(profile, [])
    flows = _year_zero_flows(profile)
    retire_row = baseline["years"][-1]

    income_0 = flows["income"]
    expenses_0 = flows["expenses"]
    debt_payments_0 = flows["debt_payments"]
    monthly_outflow_0 = flows["monthly_outflow"]

    # --- Metrics ---
    if monthly_outflow_0 > 0:
        emergency_fund_months = min(round(profile["cash"] / monthly_outflow_0, 1), 99.9)
    else:
        emergency_fund_months = 99.9  # no outflow -> cash lasts effectively forever, capped

    if income_0 > 0:
        savings_rate = _round3(
            (flows["employee"] + flows["employer"] + flows["take_home"] - expenses_0 - debt_payments_0)
            / income_0
        )
        debt_to_income = _round3(debt_payments_0 / income_0)
    else:
        savings_rate = 0.0
        debt_to_income = 0.0

    retirement_target = 25 * retire_row["expenses"]
    retirement_projected = retire_row["retirement"]
    retirement_ratio = _round3(retirement_projected / retirement_target) if retirement_target != 0 else 1.0

    highlights = [
        _emergency_fund_highlight(emergency_fund_months),
        _savings_rate_highlight(savings_rate),
        _debt_to_income_highlight(debt_to_income, debt_payments_0),
        _retirement_pace_highlight(retirement_ratio, profile["retire_age"]),
    ]

    suggested_scenarios = _suggested_scenarios(profile)

    return {
        "savings_rate": savings_rate,
        "emergency_fund_months": emergency_fund_months,
        "debt_to_income": debt_to_income,
        "retirement_target": retirement_target,
        "retirement_projected": retirement_projected,
        "retirement_ratio": retirement_ratio,
        "highlights": highlights,
        "suggested_scenarios": suggested_scenarios,
    }


# --- Highlights. Tones compare the rounded value shown in the text; boundaries -> better tone. ---


def _emergency_fund_highlight(months: float) -> dict:
    # good >= 6, watch 3 to 6, alert < 3. Boundaries (6, 3) belong to the better tone.
    if months >= 6:
        tone = "good"
    elif months >= 3:
        tone = "watch"
    else:
        tone = "alert"
    return {"code": "emergency_fund", "tone": tone, "text": f"Cash covers {months:.1f} months of expenses."}


def _savings_rate_highlight(savings_rate: float) -> dict:
    p = _whole_percent(savings_rate)  # the percent shown in the text drives the tone
    # good >= 15, watch 5 to 15, alert < 5. Boundaries (15, 5) belong to the better tone.
    if p >= 15:
        tone = "good"
    elif p >= 5:
        tone = "watch"
    else:
        tone = "alert"
    return {
        "code": "savings_rate",
        "tone": tone,
        "text": f"You save {p}% of your income, including your 401(k).",
    }


def _debt_to_income_highlight(debt_to_income: float, debt_payments_0: float) -> dict:
    if debt_payments_0 == 0:
        return {"code": "debt_to_income", "tone": "good", "text": "You have no debt payments."}
    p = _whole_percent(debt_to_income)
    # good <= 20, watch 20 to 36, alert > 36. Lower is better, so 20 -> good, 36 -> watch.
    if p <= 20:
        tone = "good"
    elif p <= 36:
        tone = "watch"
    else:
        tone = "alert"
    return {"code": "debt_to_income", "tone": tone, "text": f"Debt payments take {p}% of your income."}


def _retirement_pace_highlight(retirement_ratio: float, retire_age: int) -> dict:
    p = _whole_percent(retirement_ratio)
    # good >= 100, watch 60 to 100, alert < 60. Boundaries (100, 60) belong to the better tone.
    if p >= 100:
        tone = "good"
    elif p >= 60:
        tone = "watch"
    else:
        tone = "alert"
    return {
        "code": "retirement_pace",
        "tone": tone,
        "text": (
            f"You're on pace for {p}% of a common retirement benchmark "
            f"(25x yearly expenses at {retire_age})."
        ),
    }


# --- Suggested scenarios. Exactly 3, in order. Ages clipped to retire_age - 1. ---


def _suggested_scenarios(profile: dict) -> list[dict]:
    age = profile["age"]
    retire_age = profile["retire_age"]
    income = profile["income"]
    retirement_pct = profile["retirement_pct"]

    def clip(a: int) -> int:
        return min(a, retire_age - 1)

    # 1. buy_house at age + 6. price = max(50000, round(income * 6 / 10000) * 10000). Uncapped.
    house_age = clip(age + 6)
    price = max(50000, round(income * 6 / 10000) * 10000)
    buy_house = {
        "type": "buy_house",
        "age": house_age,
        "price": price,
        "down_pct": 0.10,
        "rate": 0.065,
        "years": 30,
    }
    scenario_house = {"prompt": f"What if I buy a {money(price)} house at {house_age}?", "event": buy_house}

    # 2. job_loss at age + 3, 6 months.
    loss_age = clip(age + 3)
    job_loss = {"type": "job_loss", "age": loss_age, "months": 6}
    scenario_loss = {"prompt": f"What if I lose my job for 6 months at {loss_age}?", "event": job_loss}

    # 3. set_retirement_pct if under 15%, else have_child.
    if retirement_pct < 0.15:
        third_age = clip(age + 3)
        new_pct = min(retirement_pct + 0.05, 0.15)
        third_event = {"type": "set_retirement_pct", "age": third_age, "pct": new_pct}
        scenario_third = {
            "prompt": f"What if I raise my 401(k) to {_pct_label(new_pct)}% at {third_age}?",
            "event": third_event,
        }
    else:
        third_age = clip(age + 8)
        third_event = {"type": "have_child", "age": third_age, "annual_cost": 15000}
        scenario_third = {"prompt": f"What if I have a child at {third_age}?", "event": third_event}

    return [scenario_house, scenario_loss, scenario_third]
