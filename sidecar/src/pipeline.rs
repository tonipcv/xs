use anyhow::Result;
use std::sync::Arc;
use async_trait::async_trait;

use crate::config::Config;
use crate::watermark;
use crate::metrics;
use crate::metadata_store::MetadataStore;

#[async_trait]
pub trait DataPipeline: Send + Sync {
    fn name(&self) -> &'static str;
    async fn process(&self, data: Vec<u8>, config: &Config) -> Result<Vec<u8>>;
}

pub struct AudioPipeline {
    session_id: String,
    dataset_id: String,
    lease_id: String,
    tenant_id: String,
    metadata_store: Option<MetadataStore>,
}

impl AudioPipeline {
    pub fn new(config: &Config, metadata_store: Option<MetadataStore>) -> Self {
        Self {
            session_id: config.session_id.clone(),
            dataset_id: config.dataset_id.clone(),
            lease_id: config.lease_id.clone(),
            tenant_id: config.tenant_id.clone(),
            metadata_store,
        }
    }
}

#[async_trait]
impl DataPipeline for AudioPipeline {
    fn name(&self) -> &'static str { "audio" }
    async fn process(&self, data: Vec<u8>, config: &Config) -> Result<Vec<u8>> {
        // Step 1: Advanced audio processing with metadata persistence
        let (mut out, _result) = crate::audio_advanced::process_audio_advanced(
            data,
            config,
            &self.session_id,
            &self.dataset_id,
            &self.lease_id,
            &self.tenant_id,
            self.metadata_store.as_ref(),
        ).await?;
        
        // Step 2: Watermarking (always applied for provenance)
        out = watermark::watermark_audio_probabilistic(out, &config.contract_id, watermark::WATERMARK_PROBABILITY)?;
        
        metrics::add_processed_bytes(out.len() as u64);
        Ok(out)
    }
}

pub struct PassthroughPipeline;
#[async_trait]
impl DataPipeline for PassthroughPipeline {
    fn name(&self) -> &'static str { "passthrough" }
    async fn process(&self, data: Vec<u8>, _config: &Config) -> Result<Vec<u8>> {
        metrics::add_processed_bytes(data.len() as u64);
        Ok(data)
    }
}

pub struct DicomPipeline;
#[async_trait]
impl DataPipeline for DicomPipeline {
    fn name(&self) -> &'static str { "dicom" }
    async fn process(&self, data: Vec<u8>, config: &Config) -> Result<Vec<u8>> {
        // Full DICOM processing: tag stripping, OCR scrubbing, NIfTI conversion
        let out = crate::dicom_advanced::process_dicom_advanced(data, config)?;
        metrics::add_processed_bytes(out.len() as u64);
        Ok(out)
    }
}

pub struct FhirPipeline;
#[async_trait]
impl DataPipeline for FhirPipeline {
    fn name(&self) -> &'static str { "fhir" }
    async fn process(&self, data: Vec<u8>, config: &Config) -> Result<Vec<u8>> {
        // Full FHIR/HL7 processing: date shifting, key redaction, NLP redaction
        let out = crate::fhir_advanced::process_fhir_advanced(data, config)?;
        metrics::add_processed_bytes(out.len() as u64);
        // Redaction count tracked inside fhir_advanced
        Ok(out)
    }
}

pub struct TextPipeline;
#[async_trait]
impl DataPipeline for TextPipeline {
    fn name(&self) -> &'static str { "text" }
    async fn process(&self, data: Vec<u8>, _config: &Config) -> Result<Vec<u8>> {
        // Basic regex redaction stub (emails/phones) using deidentify_text
        let res = crate::deidentify_text::redact_common_text(data)?;
        metrics::add_processed_bytes(res.bytes.len() as u64);
        metrics::add_redactions(res.redactions);
        Ok(res.bytes)
    }
}

pub struct TimeSeriesPipeline;
#[async_trait]
impl DataPipeline for TimeSeriesPipeline {
    fn name(&self) -> &'static str { "timeseries" }
    async fn process(&self, data: Vec<u8>, _config: &Config) -> Result<Vec<u8>> {
        metrics::add_processed_bytes(data.len() as u64);
        Ok(data)
    }
}

#[allow(dead_code)]
pub enum PipelineKind {
    Audio,
    Dicom,
    Fhir,
    Text,
    TimeSeries,
    Passthrough,
}

pub fn select_pipeline(config: &Config, metadata_store: Option<MetadataStore>) -> Arc<dyn DataPipeline> {
    match config.data_pipeline.as_str() {
        "audio" => Arc::new(AudioPipeline::new(config, metadata_store)),
        "dicom" => Arc::new(DicomPipeline),
        "fhir" => Arc::new(FhirPipeline),
        "text" => Arc::new(TextPipeline),
        "timeseries" => Arc::new(TimeSeriesPipeline),
        _ => Arc::new(PassthroughPipeline),
    }
}
