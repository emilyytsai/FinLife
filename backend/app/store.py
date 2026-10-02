"""Brief and audit storage: local files in development, DynamoDB in AWS (Brian: B2)."""

import json
import re
from pathlib import Path
from typing import Protocol

from app.config import get_settings

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


class DynamoStore:
    """DynamoDB tables finlife-briefs (TTL on expires_at) and finlife-audit. Brian implements this in B2."""

    def __init__(self, briefs_table: str, audit_table: str):
        self.briefs_table = briefs_table
        self.audit_table = audit_table

    def save_brief(self, brief: dict) -> None:
        raise NotImplementedError("Brian: B2")

    def get_brief(self, brief_id: str) -> dict | None:
        raise NotImplementedError("Brian: B2")

    def write_audit(self, record: dict) -> None:
        raise NotImplementedError("Brian: B2")


def get_store() -> Store:
    settings = get_settings()
    if settings.briefs_table and settings.audit_table:
        return DynamoStore(settings.briefs_table, settings.audit_table)
    return LocalStore(settings.local_dir)
