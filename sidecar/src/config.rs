use anyhow::{Result, Context};
use std::env;

#[derive(Clone)]
pub struct Config {
    pub contract_id: String,
    pub api_key: String,
    pub base_url: String,
    pub lease_id: String,
    pub socket_path: String,
    pub cache_size_gb: usize,
    pub bucket_name: String,
    pub bucket_prefix: String,
    
    // Hospital adaptation configuration
    pub ingestion_mode: String,             // s3|dicomweb|fhir|hybrid
    pub dicomweb_url: Option<String>,       // DICOMweb PACS URL (e.g., http://pacs.hospital.local:8080/dcm4chee-arc)
    pub dicomweb_auth_token: Option<String>, // Optional auth token for DICOMweb
    pub fhir_url: Option<String>,           // FHIR server URL (e.g., http://fhir.hospital.local:8080/fhir)
    pub fhir_auth_token: Option<String>,    // Optional auth token for FHIR
    pub hybrid_fallback_to_s3: bool,        // If true, fallback to S3 when PACS/FHIR fails
    pub resilience_grace_period_seconds: u64, // Grace period before entering cache-only mode
    pub metrics_bind_addr: String,          // Prometheus metrics server bind address
    
    // Pipeline configuration
    pub data_pipeline: String,              // audio|dicom|fhir|text|timeseries|passthrough
    pub dicom_strip_tags: Vec<String>,      // e.g., ["PatientName","PatientID"]
    pub fhir_redact_paths: Vec<String>,     // e.g., ["$.patient.name","$.identifier"]
    
    // Audio pipeline advanced features
    pub audio_f0_shift_semitones: f32,      // Pitch shift in semitones (e.g., -2.0 to 2.0)
    pub audio_enable_diarization: bool,     // Enable speaker diarization
    pub audio_enable_redaction: bool,       // Enable audio redaction (silence PHI)
    
    // DICOM pipeline advanced features
    pub dicom_enable_ocr: bool,             // Enable OCR pixel scrubbing
    pub dicom_enable_nifti: bool,           // Enable NIfTI conversion
    
    // FHIR/HL7 pipeline advanced features
    pub fhir_date_shift_days: i32,          // Date shifting offset in days
    pub fhir_enable_nlp: bool,              // Enable NLP redaction for medical reports
}

impl Config {
    #[cfg(test)]
    pub fn test_default() -> Self {
        Self {
            contract_id: "test".into(),
            api_key: "test_key".into(),
            base_url: "http://localhost".into(),
            lease_id: "test_lease".into(),
            socket_path: "/tmp/test.sock".into(),
            cache_size_gb: 1,
            bucket_name: "test_bucket".into(),
            bucket_prefix: "test_prefix".into(),
            ingestion_mode: "s3".into(),
            dicomweb_url: None,
            dicomweb_auth_token: None,
            fhir_url: None,
            fhir_auth_token: None,
            hybrid_fallback_to_s3: false,
            resilience_grace_period_seconds: 300,
            metrics_bind_addr: "0.0.0.0:9090".into(),
            data_pipeline: "passthrough".into(),
            dicom_strip_tags: vec![],
            fhir_redact_paths: vec![],
            audio_f0_shift_semitones: 0.0,
            audio_enable_diarization: false,
            audio_enable_redaction: false,
            dicom_enable_ocr: false,
            dicom_enable_nifti: false,
            fhir_date_shift_days: 0,
            fhir_enable_nlp: false,
        }
    }
    
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            contract_id: env::var("CONTRACT_ID")
                .context("CONTRACT_ID not set")?,
            api_key: env::var("XASE_API_KEY")
                .context("XASE_API_KEY not set")?,
            base_url: env::var("XASE_BASE_URL")
                .unwrap_or_else(|_| "https://xase.ai".to_string()),
            lease_id: env::var("LEASE_ID")
                .context("LEASE_ID not set")?,
            socket_path: env::var("SOCKET_PATH")
                .unwrap_or_else(|_| "/var/run/xase/sidecar.sock".to_string()),
            cache_size_gb: env::var("CACHE_SIZE_GB")
                .unwrap_or_else(|_| "100".to_string())
                .parse()
                .context("Invalid CACHE_SIZE_GB")?,
            bucket_name: env::var("BUCKET_NAME")
                .context("BUCKET_NAME not set")?,
            bucket_prefix: env::var("BUCKET_PREFIX")
                .unwrap_or_else(|_| "".to_string()),
            
            // Hospital adaptation
            ingestion_mode: env::var("INGESTION_MODE")
                .unwrap_or_else(|_| "s3".to_string()),
            dicomweb_url: env::var("DICOMWEB_URL").ok(),
            dicomweb_auth_token: env::var("DICOMWEB_AUTH_TOKEN").ok(),
            fhir_url: env::var("FHIR_URL").ok(),
            fhir_auth_token: env::var("FHIR_AUTH_TOKEN").ok(),
            hybrid_fallback_to_s3: env::var("HYBRID_FALLBACK_TO_S3")
                .ok().map(|s| s == "true" || s == "1").unwrap_or(true),
            resilience_grace_period_seconds: env::var("RESILIENCE_GRACE_PERIOD_SECONDS")
                .ok().and_then(|s| s.parse().ok()).unwrap_or(300),
            metrics_bind_addr: env::var("METRICS_BIND_ADDR")
                .unwrap_or_else(|_| "0.0.0.0:9090".to_string()),
            
            data_pipeline: env::var("DATA_PIPELINE").unwrap_or_else(|_| "audio".to_string()),
            dicom_strip_tags: env::var("DICOM_STRIP_TAGS").ok()
                .map(|s| s.split(',').map(|v| v.trim().to_string()).filter(|v| !v.is_empty()).collect())
                .unwrap_or_else(|| vec!["PatientName".into(), "PatientID".into(), "InstitutionName".into()]),
            fhir_redact_paths: env::var("FHIR_REDACT_PATHS").ok()
                .map(|s| s.split(',').map(|v| v.trim().to_string()).filter(|v| !v.is_empty()).collect())
                .unwrap_or_else(|| vec![]),
            
            // Audio advanced
            audio_f0_shift_semitones: env::var("AUDIO_F0_SHIFT_SEMITONES")
                .ok().and_then(|s| s.parse().ok()).unwrap_or(0.0),
            audio_enable_diarization: env::var("AUDIO_ENABLE_DIARIZATION")
                .ok().map(|s| s == "true" || s == "1").unwrap_or(false),
            audio_enable_redaction: env::var("AUDIO_ENABLE_REDACTION")
                .ok().map(|s| s == "true" || s == "1").unwrap_or(false),
            
            // DICOM advanced
            dicom_enable_ocr: env::var("DICOM_ENABLE_OCR")
                .ok().map(|s| s == "true" || s == "1").unwrap_or(false),
            dicom_enable_nifti: env::var("DICOM_ENABLE_NIFTI")
                .ok().map(|s| s == "true" || s == "1").unwrap_or(false),
            
            // FHIR/HL7 advanced
            fhir_date_shift_days: env::var("FHIR_DATE_SHIFT_DAYS")
                .ok().and_then(|s| s.parse().ok()).unwrap_or(0),
            fhir_enable_nlp: env::var("FHIR_ENABLE_NLP")
                .ok().map(|s| s == "true" || s == "1").unwrap_or(false),
        })
    }
}
