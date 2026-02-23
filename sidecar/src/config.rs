use anyhow::{Result, Context};
use std::env;

#[derive(Clone)]
pub struct Config {
    pub contract_id: String,
    pub api_key: String,
    pub base_url: String,
    pub lease_id: String,
    pub session_id: String,
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
    
    // Optional identifiers for metadata + audit trails
    pub tenant_id: String,
    pub dataset_id: String,
    pub metadata_store_path: Option<String>,
    pub metadata_backend: String,           // fs|s3|clickhouse
    pub metadata_s3_bucket: Option<String>,
    pub metadata_s3_prefix: Option<String>,
    pub clickhouse_url: Option<String>,
    pub clickhouse_database: Option<String>,
    pub clickhouse_user: Option<String>,
    pub clickhouse_password: Option<String>,
    pub clickhouse_table: Option<String>,
    
    // Pipeline configuration
    pub data_pipeline: String,              // audio|dicom|fhir|text|timeseries|passthrough
    #[allow(dead_code)]
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

    // Operational toggles
    pub disable_prefetch: bool,             // Disable background prefetch loop
    pub disable_kill_switch: bool,          // Disable kill-switch polling loop
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
            // Operational toggles (tests)
            disable_prefetch: false,
            disable_kill_switch: false,
        }
    }
    
    pub fn from_env() -> Result<Self> {
        let skip_auth = env::var("XASE_SKIP_AUTH").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);

        // Helper getters with optional defaults under skip_auth
        let contract_id = match env::var("CONTRACT_ID") {
            Ok(v) => v,
            Err(_) if skip_auth => "boot_contract".to_string(),
            Err(e) => return Err(e).context("CONTRACT_ID not set"),
        };
        let api_key = match env::var("XASE_API_KEY") {
            Ok(v) => v,
            Err(_) if skip_auth => "dummy_key".to_string(),
            Err(e) => return Err(e).context("XASE_API_KEY not set"),
        };
        let lease_id = match env::var("LEASE_ID") {
            Ok(v) => v,
            Err(_) if skip_auth => "boot_lease".to_string(),
            Err(e) => return Err(e).context("LEASE_ID not set"),
        };
        let bucket_name = match env::var("BUCKET_NAME") {
            Ok(v) => v,
            Err(_) if skip_auth => "boot_bucket".to_string(),
            Err(e) => return Err(e).context("BUCKET_NAME not set"),
        };

        Ok(Self {
            contract_id,
            api_key,
            base_url: env::var("XASE_BASE_URL")
                .unwrap_or_else(|_| "https://xase.ai".to_string()),
            lease_id,
            session_id: env::var("SESSION_ID")
                .ok()
                .unwrap_or_else(|| env::var("CONTRACT_ID").unwrap_or_else(|_| "session_unknown".to_string())),
            socket_path: env::var("SOCKET_PATH")
                .unwrap_or_else(|_| "/var/run/xase/sidecar.sock".to_string()),
            cache_size_gb: env::var("CACHE_SIZE_GB")
                .unwrap_or_else(|_| "100".to_string())
                .parse()
                .context("Invalid CACHE_SIZE_GB")?,
            bucket_name,
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
            
            tenant_id: env::var("TENANT_ID").unwrap_or_else(|_| "tenant_unknown".to_string()),
            dataset_id: env::var("DATASET_ID").unwrap_or_else(|_| "dataset_unknown".to_string()),
            metadata_store_path: env::var("METADATA_STORE_PATH").ok(),
            metadata_backend: env::var("METADATA_BACKEND").unwrap_or_else(|_| "fs".to_string()),
            metadata_s3_bucket: env::var("METADATA_S3_BUCKET").ok(),
            metadata_s3_prefix: env::var("METADATA_S3_PREFIX").ok(),
            clickhouse_url: env::var("CLICKHOUSE_URL").ok(),
            clickhouse_database: env::var("CLICKHOUSE_DATABASE").ok(),
            clickhouse_user: env::var("CLICKHOUSE_USER").ok(),
            clickhouse_password: env::var("CLICKHOUSE_PASSWORD").ok(),
            clickhouse_table: env::var("CLICKHOUSE_TABLE").ok(),
            
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

            // Operational toggles
            disable_prefetch: env::var("DISABLE_PREFETCH")
                .ok().map(|s| s == "true" || s == "1").unwrap_or(skip_auth),
            disable_kill_switch: env::var("DISABLE_KILL_SWITCH")
                .ok().map(|s| s == "true" || s == "1").unwrap_or(skip_auth),
        })
    }
}
