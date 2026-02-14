#!/usr/bin/env python3
"""
Minimal PyTorch training loop consuming governed batches from Xase.

Prereqs:
  pip install httpx torch torchaudio --extra-index-url https://download.pytorch.org/whl/cpu
  export XASE_API_KEY=your_api_key
  export XASE_BASE_URL=http://localhost:3000

Run:
  python examples/train_pytorch.py ds_your_dataset_id

This example only demonstrates iteration and optional audio loading.
Integrate your real model & loss below where indicated.
"""
import os
import sys
import time
from typing import List, Dict

try:
    import torch
    import torchaudio  # optional
except Exception:
    torch = None
    torchaudio = None

from xase import GovernedDataset


def maybe_load_waveform(url: str):
    if torchaudio is None:
        return None
    try:
        # torchaudio loads from local paths/URLs; for signed URLs this may work depending on ffmpeg build
        waveform, sr = torchaudio.load(url)
        return waveform, sr
    except Exception:
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python examples/train_pytorch.py <dataset_id>")
        sys.exit(1)

    dataset_id = sys.argv[1]
    api_key = os.getenv("XASE_API_KEY")
    base_url = os.getenv("XASE_BASE_URL", "http://localhost:3000")
    if not api_key:
        print("XASE_API_KEY is required")
        sys.exit(1)

    ds = GovernedDataset(
        api_key=api_key,
        base_url=base_url,
        dataset_id=dataset_id,
        batch_limit=32,
        prefetch_batches=3,
        lease_ttl_seconds=900,
        estimated_hours_per_batch=0.25,
    )

    # If you use multiple workers, ensure the dataset starts prefetch per worker
    loader = None
    if torch is not None:
        from torch.utils.data import DataLoader
        loader = DataLoader(ds, batch_size=None, num_workers=0)

    t0 = time.time()
    batch_count = 0
    file_count = 0

    iterator = loader if loader is not None else ds
    for batch in iterator:  # batch is List[{key,url}]
        batch_count += 1
        file_count += len(batch)

        # Optional: try to load one file to verify data access
        if batch_count == 1 and len(batch) > 0:
            wf = maybe_load_waveform(batch[0]["url"])  # type: ignore
            if wf:
                print("Loaded first waveform:", wf[0].shape, "sr=", wf[1])

        # TODO: Insert model forward/backward here using your own data pipeline
        # Example pseudo-code:
        # inputs = your_decode_fn(batch)  # -> tensors
        # outputs = model(inputs)
        # loss = criterion(outputs, targets)
        # loss.backward(); optimizer.step(); optimizer.zero_grad()

        if batch_count % 10 == 0:
            elapsed = time.time() - t0
            print(f"batches={batch_count} files={file_count} elapsed={elapsed:.2f}s")

    ds.shutdown()
    elapsed = time.time() - t0
    print(f"DONE. batches={batch_count} files={file_count} elapsed={elapsed:.2f}s")


if __name__ == "__main__":
    main()
