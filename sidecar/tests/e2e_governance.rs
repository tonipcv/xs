use std::env;
use std::fs;

use xase_sidecar::ocr_scrubber::{ocr_scrub_pipeline, ScrubberConfig};
use xase_sidecar::fhir_advanced::nlp_redact_medical_text;
use xase_sidecar::audio_advanced::redact_phi_with_metadata;
use xase_sidecar::config::Config;

// These tests are optional and require real fixtures.
// Run manually with:
//   XASE_TEST_DICOM_IMAGE_PATH=... \
//   XASE_TEST_FHIR_JSON_PATH=... \
//   XASE_TEST_AUDIO_PATH=... \
//   XASE_TESSERACT_ENABLED=true \
//   WHISPER_CLI=/path/to/whisper \
//   cargo test --test e2e_governance -- --ignored

#[test]
#[ignore]
fn e2e_ocr_scrubber() {
    let path = env::var("XASE_TEST_DICOM_IMAGE_PATH").ok();
    if path.is_none() {
        return;
    }
    let data = fs::read(path.unwrap()).expect("failed to read DICOM image fixture");
    let img = image::load_from_memory(&data).expect("failed to decode image");
    let cfg = ScrubberConfig::default();
    let out = ocr_scrub_pipeline(img, cfg, true).expect("ocr scrub failed");
    assert!(out.width() > 0 && out.height() > 0);
}

#[test]
#[ignore]
fn e2e_fhir_nlp_redaction() {
    let path = env::var("XASE_TEST_FHIR_JSON_PATH").ok();
    if path.is_none() {
        return;
    }
    let data = fs::read(path.unwrap()).expect("failed to read FHIR fixture");
    let mut cfg = Config::from_env().expect("config");
    cfg.fhir_enable_nlp = true;
    let out = nlp_redact_medical_text(data, &cfg).expect("nlp redaction failed");
    assert!(!out.is_empty());
}

#[test]
#[ignore]
fn e2e_whisper_audio_redaction() {
    let path = env::var("XASE_TEST_AUDIO_PATH").ok();
    if path.is_none() {
        return;
    }
    if env::var("WHISPER_CLI").is_err() {
        return;
    }
    let data = fs::read(path.unwrap()).expect("failed to read audio fixture");
    let mut cfg = Config::from_env().expect("config");
    cfg.audio_enable_redaction = true;
    let (out, regions) = redact_phi_with_metadata(data, &cfg).expect("audio redaction failed");
    assert!(!out.is_empty());
    let _ = regions;
}
