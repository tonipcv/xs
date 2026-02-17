import types
import pytest

from xase.client import XaseClient
from xase.types import XaseError


class DummyHttp:
    def __init__(self):
        self.calls = []

    def post(self, endpoint, body, headers=None):
        self.calls.append((endpoint, body, headers or {}))
        return {"success": True, "transaction_id": body.get("input", {}).get("tx", "t1"), "receipt_url": "u", "timestamp": "now", "record_hash": "h", "chain_position": "chained"}


def _minimal_payload():
    return {
        "policy": "pol-1",
        "input": {"tx": "abc"},
        "output": {"y": 1},
    }


def test_record_fire_and_forget(monkeypatch):
    # Force fire_and_forget on and non-blocking path
    client = XaseClient({"api_key": "k", "fire_and_forget": True})
    # swap http client with dummy
    d = DummyHttp()
    client.http_client = d

    # enqueue path returns None
    res = client.record(_minimal_payload())
    assert res is None
    # nothing sent yet because it's queued; flush to force send
    client.flush(0.0)
    # After flush, at least one call should have been made
    assert len(d.calls) >= 1


def test_record_sync(monkeypatch):
    # Force synchronous path
    client = XaseClient({"api_key": "k", "fire_and_forget": False})
    d = DummyHttp()
    client.http_client = d

    res = client.record(_minimal_payload(), skip_queue=True)
    assert isinstance(res, dict)
    assert res.get("success") is True
    assert len(d.calls) == 1
    endpoint, body, headers = d.calls[0]
    assert endpoint == "/records"
    # Idempotency header is optional when not provided
    assert "Idempotency-Key" not in headers


def test_invalid_payload_raises():
    client = XaseClient({"api_key": "k", "fire_and_forget": False})
    with pytest.raises(XaseError):
        client.record({"input": {}, "output": {}})  # missing policy
    with pytest.raises(XaseError):
        client.record({"policy": "p", "output": {}})  # missing input
    with pytest.raises(XaseError):
        client.record({"policy": "p", "input": {}, "output": "x"})  # output must be dict


def test_invalid_idempotency_key_raises():
    client = XaseClient({"api_key": "k", "fire_and_forget": False})
    with pytest.raises(XaseError):
        client.record(_minimal_payload(), idempotency_key="bad key with spaces")
