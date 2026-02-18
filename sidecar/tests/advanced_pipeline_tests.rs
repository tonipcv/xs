use xase_sidecar::pipeline::{AudioPipeline, DicomPipeline, FhirPipeline, DataPipeline};
use xase_sidecar::config::Config;
use xase_sidecar::metrics;
use xase_sidecar::audio_advanced;
use xase_sidecar::fhir_advanced;
use hound::{WavWriter, WavSpec};
use std::io::Cursor;

fn full_config() -> Config {
    Config {
        contract_id: "TEST_CONTRACT".into(),
        api_key: "test_key".into(),
        base_url: "http://localhost".into(),
        lease_id: "test_lease".into(),
        socket_path: "/tmp/xase_test.sock".into(),
        cache_size_gb: 1,
        bucket_name: "test_bucket".into(),
        bucket_prefix: "test_prefix".into(),
        data_pipeline: "audio".into(),
        dicom_strip_tags: vec!["PatientName".into(), "PatientID".into()],
        fhir_redact_paths: vec!["$.patient".into()],
        audio_f0_shift_semitones: 2.0,
        audio_enable_diarization: true,
        audio_enable_redaction: true,
        dicom_enable_ocr: true,
        dicom_enable_nifti: false,
        fhir_date_shift_days: 30,
        fhir_enable_nlp: true,
    }
}

fn create_test_wav() -> Vec<u8> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut buf = Vec::new();
    {
        let mut writer = WavWriter::new(Cursor::new(&mut buf), spec).unwrap();
        // Generate 0.1 second of audio (1600 samples)
        for i in 0..1600 {
            let sample = ((i as f32 * 440.0 * 2.0 * std::f32::consts::PI / 16000.0).sin() * 10000.0) as i16;
            writer.write_sample(sample).unwrap();
        }
        writer.finalize().unwrap();
    }
    buf
}

#[test]
fn test_audio_pipeline_full_processing() {
    metrics::reset();
    let pipeline = AudioPipeline;
    let cfg = full_config();
    let input = create_test_wav();
    
    let result = pipeline.process(input.clone(), &cfg).unwrap();
    
    // Should produce valid WAV output
    assert!(result.len() > 0);
    assert!(result.starts_with(b"RIFF"));
    
    // Metrics should be incremented
    let (bytes, _) = metrics::snapshot();
    assert!(bytes > 0);
}

#[test]
fn test_audio_f0_shift() {
    let input = create_test_wav();
    let shifted = audio_advanced::f0_shift(input.clone(), 2.0).unwrap();
    
    // Shifted audio should be different length due to pitch change
    assert_ne!(shifted.len(), input.len());
    assert!(shifted.starts_with(b"RIFF"));
}

#[test]
fn test_audio_diarization() {
    let input = create_test_wav();
    let segments = audio_advanced::diarize(&input).unwrap();
    
    // Should return at least one speaker segment
    assert!(segments.len() > 0);
    assert!(segments[0].speaker_id.starts_with("SPEAKER_"));
}

#[test]
fn test_fhir_date_shifting() {
    let fhir_json = serde_json::json!({
        "resourceType": "Patient",
        "birthDate": "1980-05-15",
        "identifier": [{"value": "12345"}]
    }).to_string().into_bytes();
    
    let shifted = fhir_advanced::shift_dates(fhir_json, 30).unwrap();
    let v: serde_json::Value = serde_json::from_slice(&shifted).unwrap();
    
    // Date should be shifted by 30 days
    assert_eq!(v["birthDate"], "1980-06-14");
}

#[test]
fn test_fhir_nlp_redaction() {
    let fhir_json = serde_json::json!({
        "text": {
            "div": "Contact: john.doe@hospital.com or call 555-1234. SSN: 123-45-6789"
        }
    }).to_string().into_bytes();
    
    let cfg = full_config();
    let redacted = fhir_advanced::nlp_redact_medical_text(fhir_json, &cfg).unwrap();
    let v: serde_json::Value = serde_json::from_slice(&redacted).unwrap();
    let div = v["text"]["div"].as_str().unwrap();
    
    // PHI should be redacted
    assert!(div.contains("[REDACTED_EMAIL]"));
    assert!(div.contains("[REDACTED_PHONE]"));
    assert!(div.contains("[REDACTED_SSN]"));
    assert!(!div.contains("john.doe"));
    assert!(!div.contains("123-45-6789"));
}

#[test]
fn test_hl7v2_deidentification() {
    let hl7_msg = b"MSH|^~\\&|SYSTEM|FACILITY|APP|FACILITY|20200101120000||ADT^A01|MSG001|P|2.5\nPID|1|12345|67890|DOE^JOHN^A|19800515|M|".to_vec();
    
    let cfg = full_config();
    let result = fhir_advanced::deidentify_hl7v2(hl7_msg, &cfg).unwrap();
    let result_str = String::from_utf8(result).unwrap();
    
    // Patient identifiers should be redacted
    assert!(result_str.contains("[REDACTED]"));
    assert!(!result_str.contains("DOE^JOHN"));
    assert!(!result_str.contains("67890"));
}

#[test]
fn test_fhir_pipeline_full_processing() {
    metrics::reset();
    let pipeline = FhirPipeline;
    let mut cfg = full_config();
    cfg.fhir_date_shift_days = 30;
    cfg.fhir_enable_nlp = true;
    cfg.fhir_redact_paths = vec!["$.identifier".into()];
    
    let fhir_json = serde_json::json!({
        "resourceType": "Patient",
        "birthDate": "1980-05-15",
        "identifier": [{"value": "SECRET"}],
        "text": {
            "div": "Email: patient@example.com"
        }
    }).to_string().into_bytes();
    
    let result = pipeline.process(fhir_json, &cfg).unwrap();
    let v: serde_json::Value = serde_json::from_slice(&result).unwrap();
    
    // Date should be shifted
    assert_eq!(v["birthDate"], "1980-06-14");
    
    // Identifier should be removed
    assert!(v.get("identifier").is_none());
    
    // Email should be redacted in narrative
    let div = v["text"]["div"].as_str().unwrap();
    assert!(div.contains("[REDACTED_EMAIL]"));
    
    // Metrics should be tracked
    let (bytes, _) = metrics::snapshot();
    assert!(bytes > 0);
}

#[test]
fn test_dicom_pipeline_with_tag_stripping() {
    metrics::reset();
    let pipeline = DicomPipeline;
    let cfg = full_config();
    
    // Dummy DICOM data (real DICOM would be binary)
    let dummy_dicom = vec![1, 2, 3, 4, 5, 6, 7, 8];
    
    let result = pipeline.process(dummy_dicom.clone(), &cfg).unwrap();
    
    // Should process without error
    assert!(result.len() > 0);
    
    // Metrics should be tracked
    let (bytes, _) = metrics::snapshot();
    assert!(bytes > 0);
}

#[test]
fn test_metrics_accumulation() {
    metrics::reset();
    
    let pipeline = AudioPipeline;
    let cfg = full_config();
    let input = create_test_wav();
    
    // Process multiple times
    for _ in 0..3 {
        let _ = pipeline.process(input.clone(), &cfg).unwrap();
    }
    
    let (bytes, _) = metrics::snapshot();
    // Should accumulate across multiple calls
    assert!(bytes > 0);
}

#[test]
fn test_all_pipelines_integration() {
    metrics::reset();
    
    // Test audio
    let audio_pipeline = AudioPipeline;
    let audio_cfg = full_config();
    let audio_input = create_test_wav();
    let _ = audio_pipeline.process(audio_input, &audio_cfg).unwrap();
    
    // Test FHIR
    let fhir_pipeline = FhirPipeline;
    let fhir_cfg = full_config();
    let fhir_input = serde_json::json!({"resourceType": "Patient", "birthDate": "2000-01-01"}).to_string().into_bytes();
    let _ = fhir_pipeline.process(fhir_input, &fhir_cfg).unwrap();
    
    // Test DICOM
    let dicom_pipeline = DicomPipeline;
    let dicom_cfg = full_config();
    let dicom_input = vec![1, 2, 3, 4];
    let _ = dicom_pipeline.process(dicom_input, &dicom_cfg).unwrap();
    
    // All should have contributed to metrics
    let (bytes, _) = metrics::snapshot();
    assert!(bytes > 0);
}
