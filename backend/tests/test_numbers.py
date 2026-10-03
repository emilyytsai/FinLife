import pytest

from app.numbers import allowed_numbers, unsupported_numbers


def check(text: str, *sources) -> list[str]:
    return unsupported_numbers(text, allowed_numbers(*sources))


@pytest.mark.parametrize(
    "text, value",
    [
        ("$350k", 350000),
        ("$1.2M", 1234567),  # money(1234567) is "$1.2M"
        ("$12,000", 12000),
        ("$950", 950),
        ("$9.5k", 9500),
        ("$1.3k", 1250),  # rounds half up
        ("$1M", 999999),  # the unit is decided after rounding
        ("$12M", 12400000),
        ("$353k", 350000),  # within 1%
        ("-$3.1k", -3100),
        ("$3.1k", -3100),  # a drop is often written without the sign
        ("$1.2 million", 1234567),
        ("350k", 350000),
    ],
)
def test_dollar_amount_passes(text, value):
    assert check(f"That leaves {text} at 28.", {"value": value}) == []


@pytest.mark.parametrize(
    "text, value",
    [
        ("$1.2k", 1250),  # money(1250) is "$1.3k", and 1200 is 4% off
        ("$5k", 4600),  # money(4600) is "$4.6k"
        ("$360k", 350000),  # 2.9% off
        ("$400k", 350000),
        ("$350", 350000),  # wrong unit
    ],
)
def test_dollar_amount_fails(text, value):
    assert check(f"That leaves {text} at 28.", {"value": value}) == [text]


@pytest.mark.parametrize(
    "text, rate",
    [
        ("10%", 0.10),
        ("6.5%", 0.065),
        ("7%", 0.065),  # whole percent, rounded half up
        ("4.2%", 0.042),
        ("15%", 0.149),
        ("15%", 0.145),
        ("35 percent", 0.345),
    ],
)
def test_percent_passes(text, rate):
    assert check(f"You'd save {text} from 25.", {"rate": rate}) == []


@pytest.mark.parametrize(
    "text, rate",
    [
        ("6%", 0.065),
        ("12%", 0.10),
        ("10.5%", 0.10),
    ],
)
def test_percent_fails(text, rate):
    assert check(f"You'd save {text} from 25.", {"rate": rate}) == [text]


def test_small_whole_numbers_pass_without_a_source():
    assert check("At 28 you buy, at 31 you lose 6 months of pay, ages 28-31, 3 events, 25x, 120.") == []


@pytest.mark.parametrize("text", ["121", "2.1", "1,000", "1.5x"])
def test_other_plain_numbers_need_a_source(text):
    assert check(f"It comes to {text} later.") == [text.removesuffix("x")]


def test_plain_decimal_passes_when_a_source_has_it():
    assert check("Cash covers 2.1 months.", {"months": 2.06}) == []


def test_401k_is_not_a_number():
    assert check("Raise your 401(k) or 401k or 401 (k) to 10%.", {"pct": 0.10}) == []


def test_reports_every_unsupported_number_in_order():
    text = "You'd have $400k at 60, save 12%, and keep $350k."
    assert check(text, {"price": 350000, "pct": 0.10}) == ["$400k", "12%"]


def test_numbers_come_from_nested_values_and_strings():
    profile = {"debts": [{"balance": 25000, "rate": 0.055}]}
    tool_result = {"events": ["Buy a $350k house at 28"], "flags": [{"message": "Cash covers 2.1 months of expenses"}]}
    analysis = {"highlights": [{"text": "You save 15% of your income, including your 401(k)."}]}
    text = "Your $25k loan at 5.5%, a $350k house, 2.1 months of cash, and you save 15%."
    assert check(text, profile, tool_result, analysis) == []


def test_true_and_false_are_not_numbers():
    assert check("That leaves $1 extra.", {"ok": True}) == ["$1"]
