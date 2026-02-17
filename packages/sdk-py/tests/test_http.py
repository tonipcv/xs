import types
import time
import httpx
import pytest

from xase.http import HttpClient
from xase.types import XaseError


class _Resp:
    def __init__(self, status_code=200, json_data=None, headers=None, text=""):
        self.status_code = status_code
        self._json = json_data or {}
        self.headers = headers or {}
        self.text = text or ("{}" if json_data is not None else "")

    @property
    def is_success(self):
        return 200 <= self.status_code < 300

    def json(self):
        return self._json


def test_post_success(monkeypatch):
    called = {"n": 0}

    def fake_post(url, json, headers, timeout):
        called["n"] += 1
        return _Resp(200, {"ok": True})

    monkeypatch.setattr(httpx, "post", fake_post)

    client = HttpClient(api_key="k", base_url="https://api", timeout=1.0, max_retries=2)
    res = client.post("/records", {"a": 1})
    assert res == {"ok": True}
    assert called["n"] == 1


def test_post_retry_on_429_with_retry_after(monkeypatch):
    calls = {"n": 0}

    def fake_post(url, json, headers, timeout):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Resp(429, {"error": "rate"}, headers={"Retry-After": "0"}, text="{ }")
        return _Resp(200, {"ok": True})

    monkeypatch.setattr(httpx, "post", fake_post)

    client = HttpClient(api_key="k", base_url="https://api", timeout=1.0, max_retries=3, base_delay=0.0)
    t0 = time.time()
    res = client.post("/records", {"a": 1})
    dt = time.time() - t0
    assert res == {"ok": True}
    assert calls["n"] == 2
    assert dt >= 0.0


def test_post_retry_on_5xx_and_then_fail(monkeypatch):
    calls = {"n": 0}

    def fake_post(url, json, headers, timeout):
        calls["n"] += 1
        return _Resp(502, {"error": "bad gw"}, text="{ }")

    monkeypatch.setattr(httpx, "post", fake_post)

    client = HttpClient(api_key="k", base_url="https://api", timeout=1.0, max_retries=1, base_delay=0.0)
    with pytest.raises(XaseError) as ei:
        client.post("/records", {"a": 1})
    assert ei.value.code in ("REQUEST_FAILED", "MAX_RETRIES")
    assert calls["n"] >= 2


def test_post_client_error_400_no_retry(monkeypatch):
    calls = {"n": 0}

    def fake_post(url, json, headers, timeout):
        calls["n"] += 1
        return _Resp(400, {"error": "bad req", "code": "BAD"}, text="{ }")

    monkeypatch.setattr(httpx, "post", fake_post)

    client = HttpClient(api_key="k", base_url="https://api", timeout=1.0, max_retries=3)
    with pytest.raises(XaseError) as ei:
        client.post("/records", {"a": 1})
    assert ei.value.code == "BAD"
    assert calls["n"] == 1
