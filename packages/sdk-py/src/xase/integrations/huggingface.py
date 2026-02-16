"""
HuggingFace Transformers Integration for XASE

Provides native compatibility with HuggingFace Trainer and datasets library.
"""
from typing import Iterator, Optional, Dict, Any
import logging

try:
    from datasets import IterableDataset as HFIterableDataset
    HF_AVAILABLE = True
except ImportError:
    HF_AVAILABLE = False
    HFIterableDataset = object

from ..sidecar import SidecarDataset

logger = logging.getLogger(__name__)


class XaseAudioDataset(HFIterableDataset if HF_AVAILABLE else object):
    """
    XASE Audio Dataset compatible with HuggingFace Trainer.
    
    Streams audio data from XASE Sidecar with automatic watermarking and governance.
    
    Example:
        >>> from transformers import Trainer, TrainingArguments
        >>> from xase.integrations.huggingface import XaseAudioDataset
        >>> 
        >>> # Create dataset
        >>> dataset = XaseAudioDataset(
        ...     segment_ids=["seg_00001", "seg_00002", ...],
        ...     socket_path="/var/run/xase/sidecar.sock",
        ...     sampling_rate=16000
        ... )
        >>> 
        >>> # Use with HuggingFace Trainer
        >>> training_args = TrainingArguments(
        ...     output_dir="./output",
        ...     per_device_train_batch_size=8,
        ...     num_train_epochs=3,
        ... )
        >>> 
        >>> trainer = Trainer(
        ...     model=model,
        ...     args=training_args,
        ...     train_dataset=dataset,
        ... )
        >>> 
        >>> trainer.train()
    """
    
    def __init__(
        self,
        segment_ids: list[str],
        socket_path: str = "/var/run/xase/sidecar.sock",
        sampling_rate: int = 16000,
        num_connections: int = 4,
        max_retries: int = 3,
        feature_extractor: Optional[Any] = None,
        return_tensors: str = "pt",
    ):
        """
        Initialize XASE Audio Dataset for HuggingFace.
        
        Args:
            segment_ids: List of segment IDs to stream
            socket_path: Path to Sidecar Unix socket
            sampling_rate: Audio sampling rate in Hz (default: 16000)
            num_connections: Number of parallel socket connections (default: 4)
            max_retries: Maximum retry attempts (default: 3)
            feature_extractor: Optional HF feature extractor to apply
            return_tensors: Tensor format - "pt" (PyTorch) or "np" (NumPy)
        """
        if not HF_AVAILABLE:
            raise ImportError(
                "HuggingFace datasets library is required. "
                "Install with: pip install datasets"
            )
        
        super().__init__()
        
        self.segment_ids = segment_ids
        self.sampling_rate = sampling_rate
        self.feature_extractor = feature_extractor
        self.return_tensors = return_tensors
        
        # Initialize Sidecar dataset with multi-worker support
        self._sidecar = SidecarDataset(
            segment_ids=segment_ids,
            socket_path=socket_path,
            num_connections=num_connections,
            max_retries=max_retries
        )
    
    def __iter__(self) -> Iterator[Dict[str, Any]]:
        """
        Iterate over audio samples in HuggingFace format.
        
        Yields:
            Dict with keys:
                - audio: Audio array or tensor
                - sampling_rate: Sampling rate in Hz
                - segment_id: Original segment identifier
        """
        for idx, audio_bytes in enumerate(self._sidecar):
            try:
                # Convert bytes to audio array
                audio_array = self._bytes_to_audio(audio_bytes)
                
                sample = {
                    "audio": audio_array,
                    "sampling_rate": self.sampling_rate,
                    "segment_id": self.segment_ids[idx] if idx < len(self.segment_ids) else f"seg_{idx}",
                }
                
                # Apply feature extractor if provided
                if self.feature_extractor is not None:
                    sample = self.feature_extractor(
                        sample["audio"],
                        sampling_rate=self.sampling_rate,
                        return_tensors=self.return_tensors
                    )
                
                yield sample
                
            except Exception as e:
                logger.error(f"Failed to process audio segment: {e}")
                continue
    
    def _bytes_to_audio(self, audio_bytes: bytes) -> Any:
        """
        Convert audio bytes to array format.
        
        Args:
            audio_bytes: Raw audio data (WAV format)
        
        Returns:
            Audio array (numpy or torch tensor based on return_tensors)
        """
        import io
        import wave
        import numpy as np
        
        # Parse WAV file
        with wave.open(io.BytesIO(audio_bytes), 'rb') as wav:
            frames = wav.readframes(wav.getnframes())
            audio_array = np.frombuffer(frames, dtype=np.int16)
            
            # Normalize to [-1, 1]
            audio_array = audio_array.astype(np.float32) / 32768.0
        
        # Convert to tensor if requested
        if self.return_tensors == "pt":
            try:
                import torch
                return torch.from_numpy(audio_array)
            except ImportError:
                logger.warning("PyTorch not available, returning numpy array")
                return audio_array
        
        return audio_array
    
    def __len__(self) -> int:
        """Return number of samples."""
        return len(self.segment_ids)
    
    def close(self) -> None:
        """Close all Sidecar connections."""
        self._sidecar.close_all()


def create_xase_dataset(
    segment_ids: list[str],
    socket_path: str = "/var/run/xase/sidecar.sock",
    **kwargs
) -> XaseAudioDataset:
    """
    Convenience function to create XASE dataset for HuggingFace.
    
    Args:
        segment_ids: List of segment IDs
        socket_path: Path to Sidecar socket
        **kwargs: Additional arguments for XaseAudioDataset
    
    Returns:
        XaseAudioDataset instance
    """
    return XaseAudioDataset(
        segment_ids=segment_ids,
        socket_path=socket_path,
        **kwargs
    )
