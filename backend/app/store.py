"""Brief and audit storage: local files in development, DynamoDB in AWS."""

import json
import re
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from app.config import aws_session, get_settings

BRIEF_ID = re.compile(r"[a-z0-9]{8}")


class Store(Protocol):
    def save_brief(self, brief: dict) -> None: ...

    def get_brief(self, brief_id: str) -> dict | None: ...

    def write_audit(self, record: dict) -> None: ...


class LocalStore:
    """Briefs in <local_dir>/briefs/<id>.json; audit records appended to <local_dir>/audit.jsonl."""

    def __init__(self, root: Path):
        self.root = root

    def save_brief(self, brief: dict) -> None:
        folder = self.root / "briefs"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{brief['id']}.json").write_text(json.dumps(brief), encoding="utf-8")

    def get_brief(self, brief_id: str) -> dict | None:
        if not BRIEF_ID.fullmatch(brief_id):  # also keeps ids from escaping the briefs folder
            return None
        path = self.root / "briefs" / f"{brief_id}.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def write_audit(self, record: dict) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        with (self.root / "audit.jsonl").open("a", encoding="utf-8") as audit_file:
            audit_file.write(json.dumps(record) + "\n")


def to_dynamo(item: dict) -> dict:
    """DynamoDB rejects floats, so every float becomes a Decimal (ints, strings, bools, and None pass through)."""
    return json.loads(json.dumps(item), parse_float=Decimal)


def from_dynamo(value):
    """DynamoDB returns every number as a Decimal: whole numbers come back as int and the rest as float."""
    if isinstance(value, dict):
        return {key: from_dynamo(item) for key, item in value.items()}
    if isinstance(value, list):
        return [from_dynamo(item) for item in value]
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return value


@lru_cache
def dynamodb():
    """One DynamoDB resource per process. Lambda sends each instance one request at a time."""
    return aws_session().resource("dynamodb")


class DynamoStore:
    """DynamoDB tables finlife-briefs (key id, TTL on expires_at) and finlife-audit (keys session_id and ts)."""

    def __init__(self, briefs_table: str, audit_table: str):
        self.briefs = dynamodb().Table(briefs_table)
        self.audit = dynamodb().Table(audit_table)

    def save_brief(self, brief: dict) -> None:
        self.briefs.put_item(Item=to_dynamo(brief))

    def get_brief(self, brief_id: str) -> dict | None:
        if not BRIEF_ID.fullmatch(brief_id):
            return None
        item = self.briefs.get_item(Key={"id": brief_id}).get("Item")
        return from_dynamo(item) if item else None

    def write_audit(self, record: dict) -> None:
        self.audit.put_item(Item=to_dynamo(record))


def get_store() -> Store:
    settings = get_settings()
    if settings.briefs_table and settings.audit_table:
        return DynamoStore(settings.briefs_table, settings.audit_table)
    return LocalStore(settings.local_dir)
