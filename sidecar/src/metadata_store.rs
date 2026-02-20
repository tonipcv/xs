use anyhow::{Result, Context};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;
use crate::audio_advanced::SpeakerSegment;

/// Metadata store for audio processing results
/// Persists diarization segments, PHI redaction info, and processing metadata
#[derive(Debug, Clone)]
pub struct MetadataStore {
    base_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioMetadata {
    pub session_id: String,
    pub dataset_id: String,
    pub lease_id: String,
    pub tenant_id: String,
    
    /// Diarization segments
    pub speaker_segments: Vec<DiarizationSegment>,
    
    /// PHI redaction metadata
    pub redacted_regions: Vec<RedactedRegion>,
    
    /// Processing statistics
    pub processing_stats: ProcessingStats,
    
    /// Timestamps
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiarizationSegment {
    pub speaker_id: String,
    pub start_sec: f32,
    pub end_sec: f32,
    pub confidence: Option<f32>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedactedRegion {
    pub start_sec: f32,
    pub end_sec: f32,
    pub reason: String, // e.g., "PHI_NAME", "PHI_SSN", "PHI_DATE"
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingStats {
    pub duration_sec: f32,
    pub sample_rate: u32,
    pub channels: u16,
    pub f0_shift_applied: bool,
    pub f0_shift_semitones: f32,
    pub diarization_enabled: bool,
    pub redaction_enabled: bool,
    pub processing_time_ms: u64,
}

impl MetadataStore {
    pub fn new(base_path: PathBuf) -> Self {
        Self { base_path }
    }
    
    /// Store audio metadata to disk
    pub async fn store(&self, metadata: &AudioMetadata) -> Result<()> {
        // Create directory structure: base_path/tenant_id/dataset_id/
        let dir_path = self.base_path
            .join(&metadata.tenant_id)
            .join(&metadata.dataset_id);
        
        fs::create_dir_all(&dir_path).await
            .context("Failed to create metadata directory")?;
        
        // File path: session_id.json
        let file_path = dir_path.join(format!("{}.json", metadata.session_id));
        
        // Serialize to JSON
        let json = serde_json::to_string_pretty(metadata)
            .context("Failed to serialize metadata")?;
        
        // Write to file
        fs::write(&file_path, json).await
            .context("Failed to write metadata file")?;
        
        tracing::info!(
            session_id = %metadata.session_id,
            tenant_id = %metadata.tenant_id,
            dataset_id = %metadata.dataset_id,
            segments = metadata.speaker_segments.len(),
            redactions = metadata.redacted_regions.len(),
            "Stored audio metadata"
        );
        
        Ok(())
    }
    
    /// Load audio metadata from disk
    pub async fn load(&self, tenant_id: &str, dataset_id: &str, session_id: &str) -> Result<AudioMetadata> {
        let file_path = self.base_path
            .join(tenant_id)
            .join(dataset_id)
            .join(format!("{}.json", session_id));
        
        let json = fs::read_to_string(&file_path).await
            .context("Failed to read metadata file")?;
        
        let metadata: AudioMetadata = serde_json::from_str(&json)
            .context("Failed to deserialize metadata")?;
        
        Ok(metadata)
    }
    
    /// List all metadata files for a dataset
    pub async fn list_sessions(&self, tenant_id: &str, dataset_id: &str) -> Result<Vec<String>> {
        let dir_path = self.base_path
            .join(tenant_id)
            .join(dataset_id);
        
        if !dir_path.exists() {
            return Ok(Vec::new());
        }
        
        let mut sessions = Vec::new();
        let mut entries = fs::read_dir(&dir_path).await
            .context("Failed to read metadata directory")?;
        
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    sessions.push(stem.to_string());
                }
            }
        }
        
        Ok(sessions)
    }
    
    /// Delete metadata for a session
    pub async fn delete(&self, tenant_id: &str, dataset_id: &str, session_id: &str) -> Result<()> {
        let file_path = self.base_path
            .join(tenant_id)
            .join(dataset_id)
            .join(format!("{}.json", session_id));
        
        if file_path.exists() {
            fs::remove_file(&file_path).await
                .context("Failed to delete metadata file")?;
            
            tracing::info!(
                session_id = %session_id,
                tenant_id = %tenant_id,
                dataset_id = %dataset_id,
                "Deleted audio metadata"
            );
        }
        
        Ok(())
    }
    
    /// Get statistics for a dataset
    pub async fn get_dataset_stats(&self, tenant_id: &str, dataset_id: &str) -> Result<DatasetStats> {
        let sessions = self.list_sessions(tenant_id, dataset_id).await?;
        
        let mut total_duration = 0.0;
        let mut total_segments = 0;
        let mut total_redactions = 0;
        let mut total_processing_time = 0u64;
        
        for session_id in &sessions {
            if let Ok(metadata) = self.load(tenant_id, dataset_id, session_id).await {
                total_duration += metadata.processing_stats.duration_sec;
                total_segments += metadata.speaker_segments.len();
                total_redactions += metadata.redacted_regions.len();
                total_processing_time += metadata.processing_stats.processing_time_ms;
            }
        }
        
        Ok(DatasetStats {
            session_count: sessions.len(),
            total_duration_sec: total_duration,
            total_segments,
            total_redactions,
            total_processing_time_ms: total_processing_time,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetStats {
    pub session_count: usize,
    pub total_duration_sec: f32,
    pub total_segments: usize,
    pub total_redactions: usize,
    pub total_processing_time_ms: u64,
}

/// Convert SpeakerSegment to DiarizationSegment
impl From<SpeakerSegment> for DiarizationSegment {
    fn from(segment: SpeakerSegment) -> Self {
        Self {
            speaker_id: segment.speaker_id,
            start_sec: segment.start_sec,
            end_sec: segment.end_sec,
            confidence: None,
            metadata: HashMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    
    #[tokio::test]
    async fn test_store_and_load_metadata() {
        let temp_dir = TempDir::new().unwrap();
        let store = MetadataStore::new(temp_dir.path().to_path_buf());
        
        let metadata = AudioMetadata {
            session_id: "session_123".to_string(),
            dataset_id: "dataset_456".to_string(),
            lease_id: "lease_789".to_string(),
            tenant_id: "tenant_abc".to_string(),
            speaker_segments: vec![
                DiarizationSegment {
                    speaker_id: "SPEAKER_00".to_string(),
                    start_sec: 0.0,
                    end_sec: 5.0,
                    confidence: Some(0.95),
                    metadata: HashMap::new(),
                },
            ],
            redacted_regions: vec![],
            processing_stats: ProcessingStats {
                duration_sec: 10.0,
                sample_rate: 16000,
                channels: 1,
                f0_shift_applied: true,
                f0_shift_semitones: 2.0,
                diarization_enabled: true,
                redaction_enabled: false,
                processing_time_ms: 1500,
            },
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        
        // Store
        store.store(&metadata).await.unwrap();
        
        // Load
        let loaded = store.load("tenant_abc", "dataset_456", "session_123").await.unwrap();
        
        assert_eq!(loaded.session_id, "session_123");
        assert_eq!(loaded.speaker_segments.len(), 1);
        assert_eq!(loaded.speaker_segments[0].speaker_id, "SPEAKER_00");
    }
    
    #[tokio::test]
    async fn test_list_sessions() {
        let temp_dir = TempDir::new().unwrap();
        let store = MetadataStore::new(temp_dir.path().to_path_buf());
        
        // Create multiple sessions
        for i in 0..3 {
            let metadata = AudioMetadata {
                session_id: format!("session_{}", i),
                dataset_id: "dataset_test".to_string(),
                lease_id: "lease_test".to_string(),
                tenant_id: "tenant_test".to_string(),
                speaker_segments: vec![],
                redacted_regions: vec![],
                processing_stats: ProcessingStats {
                    duration_sec: 10.0,
                    sample_rate: 16000,
                    channels: 1,
                    f0_shift_applied: false,
                    f0_shift_semitones: 0.0,
                    diarization_enabled: false,
                    redaction_enabled: false,
                    processing_time_ms: 1000,
                },
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            };
            store.store(&metadata).await.unwrap();
        }
        
        let sessions = store.list_sessions("tenant_test", "dataset_test").await.unwrap();
        assert_eq!(sessions.len(), 3);
    }
    
    #[tokio::test]
    async fn test_dataset_stats() {
        let temp_dir = TempDir::new().unwrap();
        let store = MetadataStore::new(temp_dir.path().to_path_buf());
        
        // Create sessions with different stats
        for i in 0..2 {
            let metadata = AudioMetadata {
                session_id: format!("session_{}", i),
                dataset_id: "dataset_stats".to_string(),
                lease_id: "lease_stats".to_string(),
                tenant_id: "tenant_stats".to_string(),
                speaker_segments: vec![
                    DiarizationSegment {
                        speaker_id: "SPEAKER_00".to_string(),
                        start_sec: 0.0,
                        end_sec: 5.0,
                        confidence: Some(0.9),
                        metadata: HashMap::new(),
                    },
                ],
                redacted_regions: vec![],
                processing_stats: ProcessingStats {
                    duration_sec: 10.0,
                    sample_rate: 16000,
                    channels: 1,
                    f0_shift_applied: false,
                    f0_shift_semitones: 0.0,
                    diarization_enabled: true,
                    redaction_enabled: false,
                    processing_time_ms: 1000,
                },
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            };
            store.store(&metadata).await.unwrap();
        }
        
        let stats = store.get_dataset_stats("tenant_stats", "dataset_stats").await.unwrap();
        assert_eq!(stats.session_count, 2);
        assert_eq!(stats.total_duration_sec, 20.0);
        assert_eq!(stats.total_segments, 2);
    }
}
