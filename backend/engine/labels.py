"""Money and event labels shared by the engine, the API, and the coach. Kevin implements this in K2."""


def money(x: float) -> str:
    """Format dollars like "$950", "$9.5k", "$350k", "$2.6M", "$12M".

    See contracts/schema.md "Money format: engine.money(x)".
    """
    raise NotImplementedError("Kevin: see schema.md Money format")


def label(event: dict) -> str:
    """Describe an event like "Buy a $350k house at 28".

    See contracts/schema.md "Labels: engine.label(event)".
    """
    raise NotImplementedError("Kevin: see schema.md Labels")
