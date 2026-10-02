"""Year-by-year simulation. Kevin implements this in K1 (simulate) and K2 (compare)."""


def simulate(profile: dict, events: list[dict]) -> dict:
    """Run the profile and events year by year and return a dict shaped like Result.

    See contracts/schema.md "Engine rules" and "Result".
    """
    raise NotImplementedError("Kevin: see schema.md Engine rules")


def compare(profile: dict, events: list[dict]) -> dict:
    """Return {"baseline", "scenario", "diff"} shaped like Compare.

    See contracts/schema.md "Compare" and the Compare part of "Engine rules".
    """
    raise NotImplementedError("Kevin: see schema.md Compare")
