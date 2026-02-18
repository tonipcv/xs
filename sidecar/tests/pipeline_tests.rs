use xase_sidecar::pipeline::{TextPipeline, FhirPipeline, PassthroughPipeline, DataPipeline};
use xase_sidecar::config::Config;
use xase_sidecar::metrics;

fn dummy_config() -> Config {
    Config {
        contract_id: "TEST".into(),
        api_key: "k".into(),
        base_url: "http://localhost".into(),
        lease_id: "lease".into(),
        socket_path: "/tmp/xase.sock".into(),
        cache_size_gb: 1,
        bucket_name: "b".into(),
        bucket_prefix: "p".into(),
        data_pipeline: "text".into(),
        dicom_strip_tags: vec!["PatientName".into(), "PatientID".into()],
        fhir_redact_paths: vec!["$.patient".into(), "$.identifier".into()],
        // Newly added advanced config fields
        audio_f0_shift_semitones: 0.0,
        audio_enable_diarization: false,
        audio_enable_redaction: false,
        dicom_enable_ocr: false,
        dicom_enable_nifti: false,
        fhir_date_shift_days: 0,
        fhir_enable_nlp: false,
    }
}

#[test]
fn text_pipeline_redacts_and_counts() {
    metrics::reset();
    let p = TextPipeline;
    let cfg = dummy_config();
    let input = b"john.doe@example.com reached at +1 415-555-1212".to_vec();
    let out = p.process(input.clone(), &cfg).expect("process ok");
    let s = String::from_utf8(out.clone()).unwrap();
    assert!(s.contains("[REDACTED_EMAIL]"));
    assert!(s.contains("[REDACTED_PHONE]"));

    let (bytes, redactions) = metrics::snapshot();
    assert_eq!(bytes as usize, out.len());
    assert!(redactions >= 2);
}

#[test]
fn fhir_pipeline_redacts_keys_and_counts() {
    metrics::reset();
    let p = FhirPipeline;
    let mut cfg = dummy_config();
    cfg.fhir_redact_paths = vec!["$.patient".into(), "$.identifier".into()];
    let input = serde_json::json!({
        "patient": {"name": "John"},
        "identifier": "123",
        "resourceType": "Observation"
    }).to_string().into_bytes();

    let out = p.process(input, &cfg).expect("process ok");
    let v: serde_json::Value = serde_json::from_slice(&out).unwrap();
    assert!(v.get("patient").is_none());
    assert!(v.get("identifier").is_none());
    assert!(v.get("resourceType").is_some());

    let (_bytes, redactions) = metrics::snapshot();
    assert!(redactions >= 1);
}

#[test]
fn passthrough_counts_bytes_only() {
    metrics::reset();
    let p = PassthroughPipeline;
    let cfg = dummy_config();
    let input = b"raw bytes here".to_vec();
    let out = p.process(input.clone(), &cfg).expect("process ok");
    assert_eq!(out, input);

    let (bytes, redactions) = metrics::snapshot();
    assert_eq!(bytes as usize, out.len());
    assert_eq!(redactions, 0);
}
