import sys
import types
import io
import json
import pytest

from xase.sidecar import SidecarDataset, DataType, audio_bytes_to_tensor, SidecarControl


def test_datatype_normalization_enum_and_string():
    ds1 = SidecarDataset(segment_ids=["seg_1"], data_type=DataType.AUDIO)
    assert ds1.data_type == "AUDIO"

    ds2 = SidecarDataset(segment_ids=["seg_1"], data_type="audio")
    assert ds2.data_type == "AUDIO"


@pytest.mark.parametrize("use_soundfile", [True, False])
def test_audio_bytes_to_tensor_with_backends(monkeypatch, use_soundfile):
    # Skip if required heavy deps are missing when needed
    np = pytest.importorskip("numpy")
    torch = pytest.importorskip("torch")

    # Generate a short 1 kHz sine wave (mono) as float32 PCM in memory
    sr = 8000
    t = np.linspace(0, 0.01, int(sr * 0.01), endpoint=False, dtype=np.float32)
    sig = np.sin(2 * np.pi * 1000 * t).astype(np.float32)

    if use_soundfile:
        sf_mod = types.ModuleType("soundfile")
        def fake_read(fileobj, dtype="float32", always_2d=True):
            # Return (N,1) array and sr
            arr = sig.reshape(-1, 1)
            return arr, sr
        sf_mod.read = fake_read
        monkeypatch.setitem(sys.modules, "soundfile", sf_mod)
        # Ensure torchaudio path is not used
        if "torchaudio" in sys.modules:
            del sys.modules["torchaudio"]
    else:
        # Mock torchaudio.load -> (tensor[c,t], sr)
        ta_mod = types.ModuleType("torchaudio")
        class _TATransforms:
            def Resample(self, s_in, s_out):
                class _R:
                    def __init__(self, s_in, s_out):
                        self.s_in = s_in
                        self.s_out = s_out
                    def __call__(self, x):
                        # Simple nearest resample using numpy then back to torch
                        import numpy as _np
                        import torch as _torch
                        ratio = float(self.s_out) / float(self.s_in)
                        new_len = int(round(x.shape[-1] * ratio))
                        arr = x.squeeze(0).detach().cpu().numpy()
                        x_old = _np.linspace(0.0, 1.0, num=arr.shape[-1], endpoint=False, dtype=_np.float32)
                        x_new = _np.linspace(0.0, 1.0, num=new_len, endpoint=False, dtype=_np.float32)
                        arr2 = _np.interp(x_new, x_old, arr).astype(_np.float32)
                        return _torch.from_numpy(arr2).unsqueeze(0)
                return _R(s_in, s_out)
        def fake_load(fileobj):
            import torch as _torch
            return _torch.from_numpy(sig).unsqueeze(0), sr
        ta_mod.transforms = _TATransforms()
        ta_mod.load = fake_load
        monkeypatch.setitem(sys.modules, "torchaudio", ta_mod)
        # Ensure soundfile path is not used
        if "soundfile" in sys.modules:
            del sys.modules["soundfile"]

    wav, out_sr = audio_bytes_to_tensor(b"dummy-bytes")
    assert hasattr(wav, "shape") and wav.ndim == 1
    assert isinstance(out_sr, int) and out_sr == 16000  # target resample


def test_sidecar_control_pipeline_config(monkeypatch):
    class _Resp:
        def __init__(self):
            self._json = {"modalities": ["AUDIO","IMAGE"], "transforms": {"AUDIO": ["wm_detect"]}}
        def raise_for_status(self):
            return None
        def json(self):
            return self._json
    class _Client:
        def __init__(self, *a, **kw):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def get(self, url, headers=None, timeout=None):
            assert url.endswith("/api/v1/sidecar/pipeline/config")
            assert headers and headers.get("X-API-Key") == "K"
            return _Resp()
    import xase.sidecar as sidecar
    # Override the httpx module already imported inside sidecar
    monkeypatch.setattr(sidecar, "httpx", types.SimpleNamespace(Client=_Client), raising=False)

    ctl = SidecarControl(api_key="K", base_url="https://xase.ai")
    cfg = ctl.get_pipeline_config()
    assert cfg["modalities"] == ["AUDIO","IMAGE"]
    assert "AUDIO" in cfg.get("transforms", {})
