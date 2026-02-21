use anyhow::Result;
use std::sync::Arc;

use crate::config::Config;
use crate::watermark;
use crate::metrics;

pub trait DataPipeline: Send + Sync {
    fn name(&self) -> &'static str;
    fn process(&self, data: Vec<u8>, config: &Config) -> Result<Vec<u8>>;
}

pub struct AudioPipeline;
impl DataPipeline for AudioPipeline {
    fn name(&self) -> &'static str { "audio" }
    fn process(&self, data: Vec<u8>, config: &Config) -> Result<Vec<u8>> {
        // Step 1: Advanced audio processing (F0 shift, redaction)
        let mut out = crate::audio_advanced::process_audio_simple(data, config)?;
        
        // Step 2: Watermarking (always applied for provenance)
        out = watermark::watermark_audio_probabilistic(out, &config.contract_id, watermark::WATERMARK_PROBABILITY)?;
        
        metrics::add_processed_bytes(out.len() as u64);
        Ok(out)
    }
}

pub struct PassthroughPipeline;
impl DataPipeline for PassthroughPipeline {
    fn name(&self) -> &'static str { "passthrough" }
    fn process(&self, data: Vec<u8>, _config: &Config) -> Result<Vec<u8>> {
        metrics::add_processed_bytes(data.len() as u64);
        Ok(data)
    }
}

pub struct DicomPipeline;
impl DataPipeline for DicomPipeline {
    fn name(&self) -> &'static str { "dicom" }
    fn process(&self, data: Vec<u8>, config: &Config) -> Result<Vec<u8>> {
        // Full DICOM processing: tag stripping, OCR scrubbing, NIfTI conversion
        let out = crate::dicom_advanced::process_dicom_advanced(data, config)?;
        metrics::add_processed_bytes(out.len() as u64);
        Ok(out)
    }
}

pub struct FhirPipeline;
impl DataPipeline for FhirPipeline {
    fn name(&self) -> &'static str { "fhir" }
    fn process(&self, data: Vec<u8>, config: &Config) -> Result<Vec<u8>> {
        // Full FHIR/HL7 processing: date shifting, key redaction, NLP redaction
        let out = crate::fhir_advanced::process_fhir_advanced(data, config)?;
        metrics::add_processed_bytes(out.len() as u64);
        // Redaction count tracked inside fhir_advanced
        Ok(out)
    }
}

pub struct TextPipeline;
impl DataPipeline for TextPipeline {
    fn name(&self) -> &'static str { "text" }
    fn process(&self, data: Vec<u8>, _config: &Config) -> Result<Vec<u8>> {
        // Basic regex redaction stub (emails/phones) using deidentify_text
        let res = crate::deidentify_text::redact_common_text(data)?;
        metrics::add_processed_bytes(res.bytes.len() as u64);
        metrics::add_redactions(res.redactions);
        Ok(res.bytes)
    }
}

pub struct TimeSeriesPipeline;
impl DataPipeline for TimeSeriesPipeline {
    fn name(&self) -> &'static str { "timeseries" }
    fn process(&self, data: Vec<u8>, _config: &Config) -> Result<Vec<u8>> {
        metrics::add_processed_bytes(data.len() as u64);
        Ok(data)
    }
}

pub enum PipelineKind {
    Audio,
    Dicom,
    Fhir,
    Text,
    TimeSeries,
    Passthrough,
}

pub fn select_pipeline(config: &Config) -> Arc<dyn DataPipeline> {
    match config.data_pipeline.as_str() {
        "audio" => Arc::new(AudioPipeline),
        "dicom" => Arc::new(DicomPipeline),
        "fhir" => Arc::new(FhirPipeline),
        "text" => Arc::new(TextPipeline),
        "timeseries" => Arc::new(TimeSeriesPipeline),
        _ => Arc::new(PassthroughPipeline),
    }
}
