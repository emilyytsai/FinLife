import json
from decimal import Decimal

import pytest
from boto3.dynamodb.types import TypeDeserializer, TypeSerializer

from app import store
from app.brief import build_brief
from app.config import get_settings
from app.store import LocalStore, from_dynamo, get_store, to_dynamo

HOUSE = {"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.1, "rate": 0.065, "years": 30}


class FakeTable:
    """A DynamoDB table without moto: items go through boto3's own serializer, which rejects floats like AWS does."""

    def __init__(self, key: str):
        self.key = key
        self.items = {}
        self.reads = 0

    def put_item(self, Item):
        self.items[Item[self.key]] = {name: TypeSerializer().serialize(value) for name, value in Item.items()}

    def get_item(self, Key):
        self.reads += 1
        item = self.items.get(Key[self.key])
        if item is None:
            return {}
        return {"Item": {name: TypeDeserializer().deserialize(value) for name, value in item.items()}}

    def all(self) -> list[dict]:
        return [{name: TypeDeserializer().deserialize(value) for name, value in item.items()} for item in self.items.values()]


class FakeDynamo:
    def __init__(self):
        self.tables = {"finlife-briefs": FakeTable("id"), "finlife-audit": FakeTable("ts")}

    def Table(self, name):
        return self.tables[name]


@pytest.fixture
def dynamo(monkeypatch):
    """Point the app at the two DynamoDB tables, backed by FakeTables."""
    fake = FakeDynamo()
    monkeypatch.setenv("BRIEFS_TABLE", "finlife-briefs")
    monkeypatch.setenv("AUDIT_TABLE", "finlife-audit")
    get_settings.cache_clear()
    monkeypatch.setattr(store, "dynamodb", lambda: fake)
    yield fake.tables
    get_settings.cache_clear()


def test_floats_become_decimals_and_everything_else_keeps_its_type():
    item = {"rate": 0.065, "price": 350000, "events": [{"down_pct": 0.1, "id": None}], "ok": True, "text": "$350k"}
    assert to_dynamo(item) == {
        "rate": Decimal("0.065"),
        "price": 350000,
        "events": [{"down_pct": Decimal("0.1"), "id": None}],
        "ok": True,
        "text": "$350k",
    }
    assert type(to_dynamo(item)["price"]) is int


def test_decimals_come_back_as_int_when_whole_and_float_otherwise():
    item = from_dynamo({"price": Decimal("350000"), "rate": Decimal("0.065"), "rows": [{"cash": Decimal("-1250.5")}], "ok": True})
    assert item == {"price": 350000, "rate": 0.065, "rows": [{"cash": -1250.5}], "ok": True}
    assert (type(item["price"]), type(item["rate"])) == (int, float)


def test_a_brief_survives_the_round_trip(maya):
    brief = build_brief(maya, [HOUSE], [])
    assert from_dynamo(to_dynamo(brief)) == brief


def test_dynamo_store_saves_and_reads_back_a_brief(dynamo, maya):
    brief = build_brief(maya, [HOUSE], [])
    get_store().save_brief(brief)
    assert get_store().get_brief(brief["id"]) == brief


def test_dynamo_store_returns_none_for_unknown_or_malformed_brief_ids(dynamo):
    assert get_store().get_brief("zzzzzzzz") is None
    assert get_store().get_brief("../audit") is None
    assert dynamo["finlife-briefs"].reads == 1


def test_local_store_appends_one_json_line_per_audit_record(tmp_path):
    records = [{"session_id": "s1", "ts": "2026-10-02T20:00:00.000Z"}, {"session_id": "s1", "ts": "2026-10-02T20:00:01.000Z"}]
    for record in records:
        LocalStore(tmp_path).write_audit(record)
    lines = (tmp_path / "audit.jsonl").read_text(encoding="utf-8").splitlines()
    assert [json.loads(line) for line in lines] == records


def test_each_chat_writes_one_audit_record_to_dynamodb(client, dynamo, maya):
    body = {"session_id": "s1", "profile": maya, "events": [HOUSE], "messages": [{"role": "user", "content": "Hi"}]}
    assert client.post("/chat", json=body).status_code == 200
    [record] = dynamo["finlife-audit"].all()
    assert record["session_id"] == "s1"
    assert from_dynamo(record["request"]) == {"profile": maya, "events": [HOUSE], "last_user_message": "Hi"}


def test_share_then_brief_round_trips_through_dynamodb(client, dynamo, maya):
    share = client.post("/share", json={"session_id": "s1", "profile": maya, "events": [HOUSE], "messages": []})
    assert share.status_code == 200
    brief = client.get(f"/brief/{share.json()['brief_id']}").json()
    assert (brief["profile"], brief["events"]) == (maya, [HOUSE])
