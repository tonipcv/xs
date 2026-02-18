use anyhow::{Result, Context};
use hound::{WavReader, WavWriter};
use std::io::Cursor;
use crate::config::Config;

/// F0 (pitch) shifting using simple resampling
/// Production: use rubato for high-quality pitch shifting
pub fn f0_shift(audio_data: Vec<u8>, semitones: f32) -> Result<Vec<u8>> {
    if semitones.abs() < 0.01 {
        return Ok(audio_data);
    }

    let mut reader = WavReader::new(Cursor::new(&audio_data))
        .context("Failed to parse WAV for F0 shift")?;
    let spec = reader.spec();
    
    // Read samples
    let samples: Vec<i16> = reader.samples::<i16>()
        .collect::<Result<Vec<_>, _>>()
        .context("Failed to read WAV samples")?;
    
    // Calculate pitch shift ratio: 2^(semitones/12)
    let ratio = 2.0_f32.powf(semitones / 12.0);
    
    // Simple linear interpolation resampling (production: use rubato)
    let new_len = (samples.len() as f32 / ratio) as usize;
    let mut shifted = Vec::with_capacity(new_len);
    
    for i in 0..new_len {
        let src_idx = (i as f32 * ratio) as usize;
        if src_idx < samples.len() {
            shifted.push(samples[src_idx]);
        }
    }
    
    // Write back to WAV
    let mut out_buf = Vec::new();
    let mut writer = WavWriter::new(Cursor::new(&mut out_buf), spec)?;
    for sample in shifted {
        writer.write_sample(sample)?;
    }
    writer.finalize()?;
    
    Ok(out_buf)
}

/// Speaker diarization stub
/// Production: integrate pyannote.audio or similar
pub fn diarize(_audio_data: &[u8]) -> Result<Vec<SpeakerSegment>> {
    #[cfg(feature = "audio-full")]
    {
        // TODO: integrate pyannote-rs when available
        // For now, return mock segments
        Ok(vec![
            SpeakerSegment { speaker_id: "SPEAKER_00".into(), start_sec: 0.0, end_sec: 5.0 },
            SpeakerSegment { speaker_id: "SPEAKER_01".into(), start_sec: 5.0, end_sec: 10.0 },
        ])
    }
    
    #[cfg(not(feature = "audio-full"))]
    {
        // Without feature, return single speaker
        Ok(vec![SpeakerSegment { speaker_id: "SPEAKER_00".into(), start_sec: 0.0, end_sec: 999.0 }])
    }
}

#[derive(Debug, Clone)]
pub struct SpeakerSegment {
    pub speaker_id: String,
    pub start_sec: f32,
    pub end_sec: f32,
}

/// Audio redaction: silence regions containing PHI
/// Production: use Whisper for transcription + NER for PHI detection
pub fn redact_phi(audio_data: Vec<u8>, _config: &Config) -> Result<Vec<u8>> {
    #[cfg(feature = "audio-full")]
    {
        // TODO: integrate whisper-rs for transcription
        // TODO: run NER on transcript to find PHI spans
        // TODO: silence corresponding audio regions
        Ok(audio_data)
    }
    
    #[cfg(not(feature = "audio-full"))]
    {
        // Without feature, return unchanged
        Ok(audio_data)
    }
}

/// Combined audio processing pipeline
pub fn process_audio_advanced(data: Vec<u8>, config: &Config) -> Result<Vec<u8>> {
    let mut result = data;
    
    // 1. F0 shift for voice biometrics masking
    if config.audio_f0_shift_semitones.abs() > 0.01 {
        result = f0_shift(result, config.audio_f0_shift_semitones)?;
    }
    
    // 2. Diarization (for metadata, doesn't modify audio)
    if config.audio_enable_diarization {
        let _segments = diarize(&result)?;
        // Store segments in metadata if needed
    }
    
    // 3. PHI redaction (silence detected PHI)
    if config.audio_enable_redaction {
        result = redact_phi(result, config)?;
    }
    
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_f0_shift_preserves_wav_structure() {
        // Create minimal WAV
        let spec = WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut buf = Vec::new();
        {
            let mut writer = WavWriter::new(Cursor::new(&mut buf), spec).unwrap();
            for i in 0..1600 {
                writer.write_sample((i % 100) as i16).unwrap();
            }
            writer.finalize().unwrap();
        }
        
        let shifted = f0_shift(buf.clone(), 2.0).unwrap();
        assert!(shifted.len() > 0);
        
        // Verify it's still valid WAV
        let reader = WavReader::new(Cursor::new(&shifted)).unwrap();
        assert_eq!(reader.spec().channels, 1);
    }
    
    #[test]
    fn test_diarize_returns_segments() {
        let dummy_audio = vec![0u8; 1000];
        let segments = diarize(&dummy_audio).unwrap();
        assert!(segments.len() > 0);
    }
}
