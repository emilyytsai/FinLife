import pytest


@pytest.mark.aws
@pytest.mark.skip(reason="Brian: B1")
def test_coach_adds_house_at_28(maya):
    """'What if I buy a $350k house at 28?' adds buy_house at 28 (price 350000) with a reply under 80 words that passes the number check."""
