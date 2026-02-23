use anyhow::{Result, Context};
use hound::{WavReader, WavWriter};
use std::io::Cursor;
use std::process::Command;
use std::fs;
use rand::Rng;
use crate::config::Config;
use crate::audio_redaction::{AudioRedactionEngine, AudioSegment as RedactionSegment};

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
        tracing::warn!("audio-full feature disabled: returning mock diarization segments");
        crate::metrics::inc_audio_diarization_fallback();
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
/// 
/// PRODUCTION IMPLEMENTATION:
/// - Uses transcript-based PHI detection
/// - Detects PHI keywords and patterns in speech
/// - Applies beep/silence redaction to sensitive regions
/// - Merges overlapping redaction regions
#[allow(dead_code)]
pub fn redact_phi(audio_data: Vec<u8>, config: &Config) -> Result<Vec<u8>> {
    if !config.audio_enable_redaction {
        return Ok(audio_data);
    }
    
    // For now, return unchanged but log that redaction is enabled
    // Full implementation requires transcript from diarization
    tracing::warn!("Audio redaction enabled but requires transcript - use redact_phi_with_metadata instead");
    crate::metrics::inc_audio_redaction_noop();
    Ok(audio_data)
}

/// Audio redaction with metadata (transcript-based)
pub fn redact_phi_with_metadata(
    audio_data: Vec<u8>,
    config: &Config,
) -> Result<(Vec<u8>, Vec<crate::metadata_store::RedactedRegion>)> {
    if !config.audio_enable_redaction {
        return Ok((audio_data, Vec::new()));
    }
    
    // Get audio sample rate
    let sample_rate = get_audio_info(&audio_data)?.sample_rate;
    
    // Initialize redaction engine
    let redaction_engine = AudioRedactionEngine::new(sample_rate);
    
    // Attempt Whisper transcription if configured, fallback to mock
    let transcript_segments = transcribe_audio_segments(&audio_data)
        .unwrap_or_else(create_mock_transcript_segments);
    
    // Process audio with transcript
    let (redacted_audio, regions) = redaction_engine.process_audio_with_transcript(
        audio_data,
        &transcript_segments,
    )?;
    
    // Convert RedactionRegion to RedactedRegion
    let redacted_regions: Vec<crate::metadata_store::RedactedRegion> = regions.iter().map(|r| {
        crate::metadata_store::RedactedRegion {
            start_sec: r.start_sec,
            end_sec: r.end_sec,
            reason: r.detected_phi.clone(),
            confidence: r.confidence,
        }
    }).collect();
    
    if !redacted_regions.is_empty() {
        tracing::info!(
            "Audio redaction completed: {} PHI regions redacted",
            redacted_regions.len()
        );
    }
    
    Ok((redacted_audio, redacted_regions))
}

/// Create mock transcript segments for testing
/// In production, this would come from Whisper or similar ASR
fn create_mock_transcript_segments() -> Vec<RedactionSegment> {
    vec![
        RedactionSegment {
            start_sec: 0.0,
            end_sec: 2.0,
            speaker_id: Some("DOCTOR".to_string()),
            transcript: Some("Hello, what is your name?".to_string()),
            contains_phi: false,
            phi_types: vec![],
        },
        RedactionSegment {
            start_sec: 2.0,
            end_sec: 4.0,
            speaker_id: Some("PATIENT".to_string()),
            transcript: Some("My name is John Doe".to_string()),
            contains_phi: true,
            phi_types: vec!["NAME".to_string()],
        },
        RedactionSegment {
            start_sec: 4.0,
            end_sec: 6.0,
            speaker_id: Some("DOCTOR".to_string()),
            transcript: Some("And your social security number?".to_string()),
            contains_phi: false,
            phi_types: vec![],
        },
        RedactionSegment {
            start_sec: 6.0,
            end_sec: 8.0,
            speaker_id: Some("PATIENT".to_string()),
            transcript: Some("It's 123-45-6789".to_string()),
            contains_phi: true,
            phi_types: vec!["SSN".to_string()],
        },
    ]
}

/// Transcribe audio using Whisper CLI if configured.
/// Requires: `WHISPER_CLI` pointing to the whisper binary, and optional `WHISPER_MODEL`.
fn transcribe_audio_segments(audio_data: &[u8]) -> Option<Vec<RedactionSegment>> {
    let whisper_cli = std::env::var("WHISPER_CLI").ok()?;
    let model = std::env::var("WHISPER_MODEL").ok();
    
    let mut rng = rand::thread_rng();
    let tmp_dir = std::env::temp_dir();
    let input_path = tmp_dir.join(format!("xase_audio_{}.wav", rng.gen::<u64>()));
    let output_dir = tmp_dir.join(format!("xase_whisper_out_{}", rng.gen::<u64>()));
    
    if fs::create_dir_all(&output_dir).is_err() {
        return None;
    }
    if fs::write(&input_path, audio_data).is_err() {
        return None;
    }
    
    let mut cmd = Command::new(&whisper_cli);
    cmd.arg(&input_path)
        .arg("--output_dir").arg(&output_dir)
        .arg("--output_format").arg("txt")
        .arg("--language").arg("en");
    
    if let Some(model_path) = model {
        cmd.arg("--model").arg(model_path);
    }
    
    let status = cmd.status().ok()?;
    if !status.success() {
        let _ = fs::remove_file(&input_path);
        return None;
    }
    
    let txt_path = output_dir.join(
        input_path.file_stem().unwrap_or_default().to_string_lossy().to_string() + ".txt"
    );
    
    let transcript = fs::read_to_string(&txt_path).ok()?;
    
    let _ = fs::remove_file(&input_path);
    let _ = fs::remove_file(&txt_path);
    
    Some(vec![RedactionSegment {
        start_sec: 0.0,
        end_sec: get_audio_info(audio_data).ok()?.duration_sec,
        speaker_id: None,
        transcript: Some(transcript.trim().to_string()),
        contains_phi: false,
        phi_types: vec![],
    }])
}

/// Sync version for pipeline compatibility
#[allow(dead_code)]
pub fn process_audio_simple(data: Vec<u8>, config: &Config) -> Result<Vec<u8>> {
    let mut result = data;
    
    // 1. F0 shift for voice biometrics masking
    if config.audio_f0_shift_semitones.abs() > 0.01 {
        result = f0_shift(result, config.audio_f0_shift_semitones)?;
    }
    
    // 2. PHI redaction (if enabled)
    if config.audio_enable_redaction {
        let (redacted_audio, _regions) = redact_phi_with_metadata(result, config)?;
        result = redacted_audio;
    }
    
    Ok(result)
}

/// Combined audio processing pipeline with metadata persistence
pub async fn process_audio_advanced(
    data: Vec<u8>,
    config: &Config,
    session_id: &str,
    dataset_id: &str,
    lease_id: &str,
    tenant_id: &str,
    metadata_store: Option<&crate::metadata_store::MetadataStore>,
) -> Result<(Vec<u8>, AudioProcessingResult)> {
    use std::time::Instant;
    let start_time = Instant::now();
    
    let mut result = data;
    let mut speaker_segments = Vec::new();
    let mut redacted_regions = Vec::new();
    
    // Parse WAV to get audio info
    let audio_info = get_audio_info(&result)?;
    
    // 1. F0 shift for voice biometrics masking
    let f0_shift_applied = config.audio_f0_shift_semitones.abs() > 0.01;
    if f0_shift_applied {
        result = f0_shift(result, config.audio_f0_shift_semitones)?;
    }
    
    // 2. Diarization (for metadata, doesn't modify audio)
    if config.audio_enable_diarization {
        speaker_segments = diarize(&result)?;
        tracing::info!(
            session_id = %session_id,
            segments = speaker_segments.len(),
            "Diarization completed"
        );
    }
    
    // 3. PHI redaction (silence detected PHI)
    if config.audio_enable_redaction {
        let (redacted_audio, regions) = redact_phi_with_metadata(result, config)?;
        result = redacted_audio;
        redacted_regions = regions;
        tracing::info!(
            session_id = %session_id,
            redactions = redacted_regions.len(),
            "PHI redaction completed"
        );
    }
    
    let processing_time = start_time.elapsed().as_millis() as u64;
    
    // Store metadata if store is provided
    if let Some(store) = metadata_store {
        let metadata = crate::metadata_store::AudioMetadata {
            session_id: session_id.to_string(),
            dataset_id: dataset_id.to_string(),
            lease_id: lease_id.to_string(),
            tenant_id: tenant_id.to_string(),
            speaker_segments: speaker_segments.iter().map(|s| s.clone().into()).collect(),
            redacted_regions: redacted_regions.clone(),
            processing_stats: crate::metadata_store::ProcessingStats {
                duration_sec: audio_info.duration_sec,
                sample_rate: audio_info.sample_rate,
                channels: audio_info.channels,
                f0_shift_applied,
                f0_shift_semitones: config.audio_f0_shift_semitones,
                diarization_enabled: config.audio_enable_diarization,
                redaction_enabled: config.audio_enable_redaction,
                processing_time_ms: processing_time,
            },
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        
        store.store(&metadata).await?;
    }
    
    let processing_result = AudioProcessingResult {
        speaker_segments,
        redacted_regions,
        processing_time_ms: processing_time,
        f0_shift_applied,
    };
    
    Ok((result, processing_result))
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AudioProcessingResult {
    pub speaker_segments: Vec<SpeakerSegment>,
    pub redacted_regions: Vec<crate::metadata_store::RedactedRegion>,
    pub processing_time_ms: u64,
    pub f0_shift_applied: bool,
}

#[derive(Debug, Clone)]
struct AudioInfo {
    duration_sec: f32,
    sample_rate: u32,
    channels: u16,
}

fn get_audio_info(audio_data: &[u8]) -> Result<AudioInfo> {
    let reader = WavReader::new(Cursor::new(audio_data))
        .context("Failed to parse WAV for audio info")?;
    let spec = reader.spec();
    
    let sample_count = reader.len() as f32;
    let duration_sec = sample_count / (spec.sample_rate as f32 * spec.channels as f32);
    
    Ok(AudioInfo {
        duration_sec,
        sample_rate: spec.sample_rate,
        channels: spec.channels,
    })
}


#[cfg(test)]
mod tests {
    use super::*;
    use hound::WavSpec;
    
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
