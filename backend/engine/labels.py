"""Money and event labels shared by the engine, the API, and the coach. Kevin implements this in K2."""

import math

# Tiers mirror frontend/src/lib/format.ts MONEY_TIERS exactly. Each tier rounds half up to its own
# `step`; if the rounded value reaches the next tier's range, the next tier is used ("decide the
# unit after rounding"): 999.5 -> $1k, 9999 -> $10k, 999999 -> $1M.
# Fields: (below, step, divisor, suffix, decimals)
_MONEY_TIERS = [
    (1_000, 1, 1, "", 0),
    (10_000, 100, 1_000, "k", 1),
    (1_000_000, 1_000, 1_000, "k", 0),
    (10_000_000, 100_000, 1_000_000, "M", 1),
    (math.inf, 1_000_000, 1_000_000, "M", 0),
]


def money(x: float) -> str:
    """Format dollars like "$950", "$9.5k", "$350k", "$2.6M", "$12M".

    See contracts/schema.md "Money format: engine.money(x)". Produces the same strings as the
    frontend formatter, so the backend and frontend never disagree by a character.
    """
    if not math.isfinite(x):
        return "\u2014"  # em dash, matches the frontend's non-finite fallback
    if x < 0:
        return "-" + money(-x)
    for below, step, divisor, suffix, decimals in _MONEY_TIERS:
        # Round half up to this tier's step, the same way the frontend does.
        rounded = math.floor(x / step + 0.5) * step
        if rounded < below:
            value = rounded / divisor
            if decimals == 1:
                text = f"{value:.1f}"
                if text.endswith(".0"):
                    text = text[:-2]
            else:
                # Whole-number tiers: value is integral, show without a trailing ".0".
                text = str(int(value))
            return f"${text}{suffix}"
    return "\u2014"


def _pct(x: float) -> str:
    """0.06 -> "6%"; one decimal when not whole: 0.075 -> "7.5%". Mirrors frontend pct()."""
    value = round(x * 1000) / 10
    if value == int(value):
        return f"{int(value)}%"
    return f"{value}%"


def label(event: dict) -> str:
    """Describe an event like "Buy a $350k house at 28".

    See contracts/schema.md "Labels: engine.label(event)".
    """
    etype = event["type"]
    age = event["age"]
    if etype == "buy_house":
        return f"Buy a {money(event['price'])} house at {age}"
    if etype == "have_child":
        return f"Have a child at {age}"
    if etype == "job_loss":
        months = event["months"]
        unit = "month" if months == 1 else "months"
        return f"Lose job for {months} {unit} at {age}"
    if etype == "set_retirement_pct":
        return f"Set 401(k) to {_pct(event['pct'])} at {age}"
    if etype == "new_debt":
        name = event["name"]
        # "if name already ends in 'loan', do not add 'loan' again"
        descriptor = name if name.rstrip().lower().endswith("loan") else f"{name} loan"
        return f"Take on a {money(event['balance'])} {descriptor} at {age}"
    raise ValueError(f"Unknown event type: {etype!r}")
