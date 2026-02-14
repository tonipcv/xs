"""
Example: Training with Xase Sidecar

This example shows how to use the Sidecar for high-performance data access
during model training.
"""
import os
from xase.sidecar import SidecarClient, SidecarDataset
from torch.utils.data import DataLoader
import torch
import torchaudio

# Configuration
SOCKET_PATH = os.getenv("XASE_SOCKET_PATH", "/var/run/xase/sidecar.sock")
SEGMENT_IDS = [f"seg_{i:05d}" for i in range(1000)]  # 1000 segments

def main():
    print("🚀 Xase Sidecar Training Example")
    print(f"   Socket: {SOCKET_PATH}")
    print(f"   Segments: {len(SEGMENT_IDS)}")
    
    # Create dataset
    dataset = SidecarDataset(
        segment_ids=SEGMENT_IDS,
        socket_path=SOCKET_PATH,
    )
    
    # Create DataLoader (no workers needed - Sidecar handles parallelism)
    loader = DataLoader(
        dataset,
        batch_size=None,  # Dataset yields individual segments
        num_workers=0,    # Sidecar handles prefetching
    )
    
    # Training loop
    print("\n📊 Starting training...")
    for epoch in range(3):
        print(f"\nEpoch {epoch + 1}/3")
        
        for i, audio_bytes in enumerate(loader):
            # Audio is already watermarked by Sidecar
            # Process audio (e.g., decode, transform, feed to model)
            
            # Example: Load audio with torchaudio
            # waveform, sample_rate = torchaudio.load(io.BytesIO(audio_bytes))
            
            if i % 100 == 0:
                print(f"  Processed {i}/{len(SEGMENT_IDS)} segments")
            
            # Your training code here
            # loss = model(waveform)
            # loss.backward()
            # optimizer.step()
        
        print(f"  ✅ Epoch {epoch + 1} complete")
    
    print("\n✅ Training complete!")

if __name__ == "__main__":
    main()
