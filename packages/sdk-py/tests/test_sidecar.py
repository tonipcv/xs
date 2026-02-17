import types
import pytest

import xase.sidecar as sidecar_mod
from xase.sidecar import SidecarDataset


class DummyClient:
    def __init__(self, *args, **kwargs):
        self._data = {"seg_1": b"A", "seg_2": b"B", "seg_3": b"C"}
        self.connected = False

    def connect(self):
        self.connected = True

    def get_segment(self, segment_id: str) -> bytes:
        return self._data.get(segment_id, b"")

    def close(self):
        self.connected = False


def test_sidecar_dataset_len_getitem(monkeypatch):
    # patch factory to return our dummy client
    monkeypatch.setattr(sidecar_mod, "SidecarClient", DummyClient)

    ds = SidecarDataset(segment_ids=["seg_1", "seg_2"], num_connections=1)
    assert len(ds) == 2
    assert ds[0] == b"A"
    assert ds[1] == b"B"


def test_sidecar_dataset_iter(monkeypatch):
    monkeypatch.setattr(sidecar_mod, "SidecarClient", DummyClient)

    ds = SidecarDataset(segment_ids=["seg_1", "seg_3"], num_connections=1)
    it = iter(ds)
    chunks = list(it)
    assert chunks == [b"A", b"C"]
