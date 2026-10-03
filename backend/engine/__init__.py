"""FinLife engine: pure functions on plain dicts. No I/O, no network, no LLM calls, no imports from app/."""

from .analysis import analyze
from .labels import label, money
from .simulate import PLAN_TO_AGE, compare, simulate

__all__ = ["simulate", "compare", "analyze", "money", "label", "PLAN_TO_AGE"]
