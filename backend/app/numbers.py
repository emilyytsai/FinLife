"""The number check: every number in a coach reply must trace back to the profile, the events, or engine output.

A number written like engine.money() output stands for every value that rounds to it, so "$1.2M" matches
1,234,567 and "$1.3k" matches 1,250. Signs are ignored: a drop of $3k is often written without the minus.
"""

import re
from decimal import Decimal

NUMBER = r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"
TOKEN = re.compile(
    rf"(?P<dollar>\$\s?)?(?P<number>{NUMBER})"
    r"(?:\s?(?P<suffix>[kKmM]\b|million\b|thousand\b))?"
    r"(?P<percent>\s?%|\s?percent\b)?"
)
NOT_A_NUMBER = re.compile(r"\b401\s?\(?k\)?", re.IGNORECASE)
UNITS = {"k": 1000, "thousand": 1000, "m": 1_000_000, "million": 1_000_000}
SMALL_WHOLE_MAX = 120  # ages, months, years, and counts
TOLERANCE = Decimal("0.01")


def allowed_numbers(*sources) -> set[Decimal]:
    """Every number in the sources: numeric values at any depth, plus numbers written inside strings."""
    found: set[Decimal] = set()
    for source in sources:
        _collect(source, found)
    return found


def unsupported_numbers(text: str, allowed: set[Decimal]) -> list[str]:
    """The numbers in text, as written, that match nothing in allowed."""
    return [match.group(0).strip() for match in _tokens(text) if not _supported(match, allowed)]


def _collect(node, found: set[Decimal]) -> None:
    if isinstance(node, bool):
        return
    if isinstance(node, (int, float)):
        found.add(abs(Decimal(str(node))))
    elif isinstance(node, str):
        found.update(_value(match) for match in _tokens(node))
    elif isinstance(node, dict):
        for value in node.values():
            _collect(value, found)
    elif isinstance(node, (list, tuple, set)):
        for value in node:
            _collect(value, found)


def _tokens(text: str) -> list[re.Match]:
    return list(TOKEN.finditer(NOT_A_NUMBER.sub(" ", text)))


def _value(match: re.Match) -> Decimal:
    """The number as a plain value: "$350k" is 350000 and "15%" is 0.15."""
    number = Decimal(match["number"].replace(",", "")) * _unit(match)
    return number / 100 if match["percent"] else number


def _unit(match: re.Match) -> int:
    return UNITS[match["suffix"].lower()] if match["suffix"] else 1


def _supported(match: re.Match, allowed: set[Decimal]) -> bool:
    low, high = _rounding_range(match)
    if match["percent"]:
        return any(low <= value * 100 < high for value in allowed)
    nominal = Decimal(match["number"].replace(",", "")) * _unit(match)
    if _is_small_whole(match, nominal):
        return True
    return any(low <= value < high or abs(value - nominal) <= value * TOLERANCE for value in allowed)


def _rounding_range(match: re.Match) -> tuple[Decimal, Decimal]:
    """The values that display as this number. money() shows "$5k" for 4,950 up to 5,050: under 10 units, it
    rounds to one decimal and drops ".0"."""
    digits = match["number"].replace(",", "")
    shown = Decimal(digits)
    decimals = len(digits.partition(".")[2])
    step = Decimal(1).scaleb(-decimals)
    if match["dollar"] and match["suffix"] and decimals == 0 and shown < 10:
        step = Decimal("0.1")
    unit = _unit(match)
    return (shown - step / 2) * unit, (shown + step / 2) * unit


def _is_small_whole(match: re.Match, nominal: Decimal) -> bool:
    plain = not (match["dollar"] or match["suffix"] or match["percent"])
    return plain and "." not in match["number"] and nominal <= SMALL_WHOLE_MAX
