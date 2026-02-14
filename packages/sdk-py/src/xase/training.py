"""
XASE Training SDK — GovernedDataset Iterable for PyTorch

- Mints a short-lived lease for a dataset
- Streams batches of presigned URLs from Xase `/api/v1/datasets/{id}/stream`
- Prefetches batches in a background thread to keep GPU fed

Usage (PyTorch):

    from xase.training import GovernedDataset
    from torch.utils.data import DataLoader

    ds = GovernedDataset(
        api_key=os.environ["XASE_API_KEY"],
        base_url=os.getenv("XASE_BASE_URL", "http://localhost:3000"),
        dataset_id="ds_...",
        batch_limit=64,
        prefetch_batches=5,
        lease_ttl_seconds=900,
        estimated_hours_per_batch=0.5,
    )

    loader = DataLoader(ds, batch_size=None)  # dataset already yields batches
    for batch in loader:
        # batch = List[ { 'key': str, 'url': str } ]
        ...

Notes:
- This reference implementation yields presigned URLs. Your training loop can
  download/transform as needed (e.g., torchaudio.load(url)).
- You can extend this to download audio bytes and return tensors inside the worker process.
"""
from __future__ import annotations

import os
import threading
import queue
import time
from typing import Any, Dict, List, Optional

import httpx

try:
    import torch
    from torch.utils.data import IterableDataset  # type: ignore
except Exception:  # pragma: no cover
    torch = None
    IterableDataset = object  # type: ignore


class _BatchPrefetcher:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        dataset_id: str,
        batch_limit: int,
        estimated_hours_per_batch: float,
        prefetch_batches: int,
        lease_id: str,
        stop_event: threading.Event,
        client_timeout: float = 10.0,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.dataset_id = dataset_id
        self.batch_limit = batch_limit
        self.estimated_hours_per_batch = estimated_hours_per_batch
        self.prefetch_batches = max(1, prefetch_batches)
        self.lease_id = lease_id
        self.stop_event = stop_event
        self.client = httpx.Client(timeout=client_timeout)
        self.q: "queue.Queue[List[Dict[str, Any]]]" = queue.Queue(maxsize=self.prefetch_batches)
        self.cursor: Optional[str] = None
        self.exc: Optional[BaseException] = None

    def _fetch_once(self) -> Optional[List[Dict[str, Any]]]:
        params = {"limit": str(self.batch_limit), "leaseId": self.lease_id}
        if self.cursor:
            params["cursor"] = self.cursor
        # soft metering to keep policy counters up-to-date
        if self.estimated_hours_per_batch > 0:
            params["estimatedHours"] = str(self.estimated_hours_per_batch)

        url = f"{self.base_url}/api/v1/datasets/{self.dataset_id}/stream"
        r = self.client.get(url, headers={"X-API-Key": self.api_key}, params=params)
        if r.status_code == 403:
            # lease expired or revoked
            return None
        r.raise_for_status()
        data = r.json()
        self.cursor = data.get("nextCursor")
        batch = data.get("batch", [])
        if not batch:
            # end of stream (no more keys)
            return None
        return batch

    def run(self) -> None:
        try:
            while not self.stop_event.is_set():
                if self.q.full():
                    time.sleep(0.01)
                    continue
                batch = self._fetch_once()
                if not batch:
                    # Put sentinel to notify consumer end-of-stream
                    self.q.put([])
                    break
                self.q.put(batch)
        except BaseException as e:  # capture to raise on consumer side
            self.exc = e
            try:
                self.q.put([])
            except Exception:
                pass

    def get(self) -> Optional[List[Dict[str, Any]]]:
        item = self.q.get()
        if item == []:
            return None
        return item


class GovernedDataset(IterableDataset):
    def __init__(
        self,
        api_key: str,
        dataset_id: str,
        base_url: str = "http://localhost:3000",
        batch_limit: int = 64,
        prefetch_batches: int = 5,
        lease_ttl_seconds: int = 900,
        estimated_hours_per_batch: float = 0.5,
        client_timeout: float = 10.0,
    ) -> None:
        super().__init__()
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.dataset_id = dataset_id
        self.batch_limit = batch_limit
        self.prefetch_batches = prefetch_batches
        self.lease_ttl_seconds = lease_ttl_seconds
        self.estimated_hours_per_batch = estimated_hours_per_batch
        self.client_timeout = client_timeout

        self._client = httpx.Client(timeout=self.client_timeout)
        self._stop_event = threading.Event()
        self._prefetcher: Optional[_BatchPrefetcher] = None
        self._thread: Optional[threading.Thread] = None
        self._lease_id: Optional[str] = None

    def _mint_lease(self) -> str:
        url = f"{self.base_url}/api/v1/leases"
        body = {"datasetId": self.dataset_id, "ttlSeconds": self.lease_ttl_seconds}
        r = self._client.post(url, json=body, headers={"X-API-Key": self.api_key})
        r.raise_for_status()
        data = r.json()
        return data["leaseId"]

    def _start_prefetch(self) -> None:
        if not self._lease_id:
            self._lease_id = self._mint_lease()
        self._prefetcher = _BatchPrefetcher(
            api_key=self.api_key,
            base_url=self.base_url,
            dataset_id=self.dataset_id,
            batch_limit=self.batch_limit,
            estimated_hours_per_batch=self.estimated_hours_per_batch,
            prefetch_batches=self.prefetch_batches,
            lease_id=self._lease_id,
            stop_event=self._stop_event,
            client_timeout=self.client_timeout,
        )
        self._thread = threading.Thread(target=self._prefetcher.run, daemon=True)
        self._thread.start()

    def __iter__(self):
        # lazy-start per worker
        if self._prefetcher is None:
            self._start_prefetch()
        assert self._prefetcher is not None

        while True:
            if self._prefetcher.exc:
                raise self._prefetcher.exc
            batch = self._prefetcher.get()
            if batch is None:
                break
            # Yield list of {key, url}
            yield batch

    def shutdown(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        try:
            self._client.close()
        except Exception:
            pass

    # convenience for context manager
    def __enter__(self) -> "GovernedDataset":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.shutdown()
