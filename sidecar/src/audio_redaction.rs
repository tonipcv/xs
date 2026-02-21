use anyhow::Result;
use std::collections::HashMap;

/// Audio redaction module for removing PHI from audio recordings
/// Implements silence-based redaction and beep replacement for sensitive content

#[derive(Debug, Clone)]
pub struct AudioSegment {
    pub start_sec: f32,
    pub end_sec: f32,
    pub speaker_id: Option<String>,
    pub transcript: Option<String>,
    pub contains_phi: bool,
    pub phi_types: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct RedactionRegion {
    pub start_sec: f32,
    pub end_sec: f32,
    pub redaction_type: RedactionType,
    pub confidence: f32,
    pub detected_phi: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RedactionType {
    Silence,      // Replace with silence
    Beep,         // Replace with beep tone
    WhiteNoise,   // Replace with white noise
    Mute,         // Mute specific frequency bands
}

/// Audio redaction engine
pub struct AudioRedactionEngine {
    sample_rate: u32,
    phi_patterns: Vec<PhiAudioPattern>,
}

struct PhiAudioPattern {
    keywords: Vec<String>,
    context_window_sec: f32,
    confidence_threshold: f32,
}

impl AudioRedactionEngine {
    pub fn new(sample_rate: u32) -> Self {
        let mut engine = Self {
            sample_rate,
            phi_patterns: Vec::new(),
        };
        
        engine.initialize_phi_patterns();
        engine
    }
    
    fn initialize_phi_patterns(&mut self) {
        // Social Security Number patterns
        self.phi_patterns.push(PhiAudioPattern {
            keywords: vec![
                "social security".to_string(),
                "SSN".to_string(),
                "social security number".to_string(),
            ],
            context_window_sec: 3.0,
            confidence_threshold: 0.8,
        });
        
        // Medical Record Number patterns
        self.phi_patterns.push(PhiAudioPattern {
            keywords: vec![
                "medical record number".to_string(),
                "MRN".to_string(),
                "patient ID".to_string(),
                "patient number".to_string(),
            ],
            context_window_sec: 2.5,
            confidence_threshold: 0.8,
        });
        
        // Name patterns
        self.phi_patterns.push(PhiAudioPattern {
            keywords: vec![
                "my name is".to_string(),
                "patient name".to_string(),
                "I am".to_string(),
                "this is".to_string(),
            ],
            context_window_sec: 2.0,
            confidence_threshold: 0.7,
        });
        
        // Contact information patterns
        self.phi_patterns.push(PhiAudioPattern {
            keywords: vec![
                "phone number".to_string(),
                "call me at".to_string(),
                "email".to_string(),
                "address".to_string(),
            ],
            context_window_sec: 3.0,
            confidence_threshold: 0.75,
        });
        
        // Date of birth patterns
        self.phi_patterns.push(PhiAudioPattern {
            keywords: vec![
                "date of birth".to_string(),
                "born on".to_string(),
                "birthday".to_string(),
                "DOB".to_string(),
            ],
            context_window_sec: 2.5,
            confidence_threshold: 0.8,
        });
    }
    
    /// Detect PHI regions in audio segments based on transcript
    pub fn detect_phi_regions(
        &self,
        segments: &[AudioSegment],
    ) -> Vec<RedactionRegion> {
        let mut regions = Vec::new();
        
        for segment in segments {
            if let Some(transcript) = &segment.transcript {
                // Check for PHI patterns in transcript
                for pattern in &self.phi_patterns {
                    if self.matches_phi_pattern(transcript, pattern) {
                        regions.push(RedactionRegion {
                            start_sec: segment.start_sec,
                            end_sec: segment.end_sec,
                            redaction_type: RedactionType::Beep,
                            confidence: pattern.confidence_threshold,
                            detected_phi: pattern.keywords[0].clone(),
                        });
                        break; // Don't double-count same segment
                    }
                }
            }
        }
        
        // Merge overlapping regions
        self.merge_redaction_regions(regions)
    }
    
    fn matches_phi_pattern(&self, transcript: &str, pattern: &PhiAudioPattern) -> bool {
        let transcript_lower = transcript.to_lowercase();
        
        for keyword in &pattern.keywords {
            if transcript_lower.contains(&keyword.to_lowercase()) {
                return true;
            }
        }
        
        false
    }
    
    fn merge_redaction_regions(&self, mut regions: Vec<RedactionRegion>) -> Vec<RedactionRegion> {
        if regions.is_empty() {
            return regions;
        }
        
        // Sort by start time
        regions.sort_by(|a, b| a.start_sec.partial_cmp(&b.start_sec).unwrap());
        
        let mut merged = Vec::new();
        let mut current = regions.remove(0);
        
        for region in regions {
            if region.start_sec <= current.end_sec + 0.5 {
                // Overlapping or close - merge
                current.end_sec = current.end_sec.max(region.end_sec);
                current.confidence = current.confidence.max(region.confidence);
            } else {
                merged.push(current);
                current = region;
            }
        }
        merged.push(current);
        
        merged
    }
    
    /// Apply redaction to audio data
    pub fn redact_audio(
        &self,
        audio_data: Vec<u8>,
        regions: &[RedactionRegion],
    ) -> Result<Vec<u8>> {
        if regions.is_empty() {
            return Ok(audio_data);
        }
        
        // Parse audio format (simplified - assumes PCM)
        let mut samples = self.bytes_to_samples(&audio_data)?;
        
        // Apply redaction to each region
        for region in regions {
            self.apply_redaction_to_samples(
                &mut samples,
                region.start_sec,
                region.end_sec,
                &region.redaction_type,
            );
        }
        
        // Convert back to bytes
        Ok(self.samples_to_bytes(&samples))
    }
    
    fn bytes_to_samples(&self, audio_data: &[u8]) -> Result<Vec<f32>> {
        // Simplified: assumes 16-bit PCM
        let mut samples = Vec::new();
        
        for chunk in audio_data.chunks_exact(2) {
            let sample = i16::from_le_bytes([chunk[0], chunk[1]]) as f32 / 32768.0;
            samples.push(sample);
        }
        
        Ok(samples)
    }
    
    fn samples_to_bytes(&self, samples: &[f32]) -> Vec<u8> {
        let mut bytes = Vec::new();
        
        for &sample in samples {
            let sample_i16 = (sample * 32768.0).clamp(-32768.0, 32767.0) as i16;
            bytes.extend_from_slice(&sample_i16.to_le_bytes());
        }
        
        bytes
    }
    
    fn apply_redaction_to_samples(
        &self,
        samples: &mut [f32],
        start_sec: f32,
        end_sec: f32,
        redaction_type: &RedactionType,
    ) {
        let start_sample = (start_sec * self.sample_rate as f32) as usize;
        let end_sample = (end_sec * self.sample_rate as f32) as usize;
        
        let start_idx = start_sample.min(samples.len());
        let end_idx = end_sample.min(samples.len());
        
        match redaction_type {
            RedactionType::Silence => {
                // Replace with silence
                for sample in &mut samples[start_idx..end_idx] {
                    *sample = 0.0;
                }
            }
            RedactionType::Beep => {
                // Replace with 1kHz beep tone
                let beep_freq = 1000.0;
                for (i, sample) in samples[start_idx..end_idx].iter_mut().enumerate() {
                    let t = (start_idx + i) as f32 / self.sample_rate as f32;
                    *sample = (2.0 * std::f32::consts::PI * beep_freq * t).sin() * 0.3;
                }
            }
            RedactionType::WhiteNoise => {
                // Replace with white noise
                use rand::Rng;
                let mut rng = rand::thread_rng();
                for sample in &mut samples[start_idx..end_idx] {
                    *sample = rng.gen_range(-0.2..0.2);
                }
            }
            RedactionType::Mute => {
                // Mute (same as silence for now)
                for sample in &mut samples[start_idx..end_idx] {
                    *sample = 0.0;
                }
            }
        }
        
        tracing::info!(
            "Applied {:?} redaction from {:.2}s to {:.2}s ({} samples)",
            redaction_type,
            start_sec,
            end_sec,
            end_idx - start_idx
        );
    }
    
    /// Full redaction pipeline with transcript-based detection
    pub fn process_audio_with_transcript(
        &self,
        audio_data: Vec<u8>,
        segments: &[AudioSegment],
    ) -> Result<(Vec<u8>, Vec<RedactionRegion>)> {
        // Detect PHI regions from transcript
        let regions = self.detect_phi_regions(segments);
        
        if regions.is_empty() {
            tracing::debug!("No PHI detected in audio transcript");
            return Ok((audio_data, regions));
        }
        
        tracing::info!("Detected {} PHI regions in audio", regions.len());
        
        // Apply redaction
        let redacted_audio = self.redact_audio(audio_data, &regions)?;
        
        Ok((redacted_audio, regions))
    }
}

impl Default for AudioRedactionEngine {
    fn default() -> Self {
        Self::new(16000) // Default to 16kHz
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_detect_phi_patterns() {
        let engine = AudioRedactionEngine::new(16000);
        
        let segments = vec![
            AudioSegment {
                start_sec: 0.0,
                end_sec: 2.0,
                speaker_id: Some("DOCTOR".to_string()),
                transcript: Some("What is your social security number?".to_string()),
                contains_phi: false,
                phi_types: vec![],
            },
            AudioSegment {
                start_sec: 2.0,
                end_sec: 4.0,
                speaker_id: Some("PATIENT".to_string()),
                transcript: Some("It's 123-45-6789".to_string()),
                contains_phi: true,
                phi_types: vec!["SSN".to_string()],
            },
        ];
        
        let regions = engine.detect_phi_regions(&segments);
        
        assert!(!regions.is_empty());
        assert!(regions.iter().any(|r| r.start_sec <= 2.0));
    }
    
    #[test]
    fn test_merge_overlapping_regions() {
        let engine = AudioRedactionEngine::new(16000);
        
        let regions = vec![
            RedactionRegion {
                start_sec: 1.0,
                end_sec: 2.0,
                redaction_type: RedactionType::Beep,
                confidence: 0.8,
                detected_phi: "SSN".to_string(),
            },
            RedactionRegion {
                start_sec: 1.5,
                end_sec: 3.0,
                redaction_type: RedactionType::Beep,
                confidence: 0.9,
                detected_phi: "Name".to_string(),
            },
        ];
        
        let merged = engine.merge_redaction_regions(regions);
        
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].start_sec, 1.0);
        assert_eq!(merged[0].end_sec, 3.0);
    }
    
    #[test]
    fn test_silence_redaction() {
        let engine = AudioRedactionEngine::new(16000);
        
        // Create simple audio (1 second of samples)
        let samples: Vec<f32> = (0..16000).map(|i| (i as f32 / 16000.0).sin()).collect();
        let audio_data = engine.samples_to_bytes(&samples);
        
        let regions = vec![
            RedactionRegion {
                start_sec: 0.25,
                end_sec: 0.75,
                redaction_type: RedactionType::Silence,
                confidence: 1.0,
                detected_phi: "Test".to_string(),
            },
        ];
        
        let redacted = engine.redact_audio(audio_data, &regions).unwrap();
        let redacted_samples = engine.bytes_to_samples(&redacted).unwrap();
        
        // Check that middle section is silent
        let start_idx = (0.25 * 16000.0) as usize;
        let end_idx = (0.75 * 16000.0) as usize;
        
        for i in start_idx..end_idx {
            assert_eq!(redacted_samples[i], 0.0);
        }
    }
}
