use std::cell::Cell;
use std::sync::atomic::{AtomicU64, Ordering};

thread_local! {
    static PROCESSED_BYTES_TL: Cell<u64> = Cell::new(0);
    static REDACTIONS_TL: Cell<u64> = Cell::new(0);
}

pub fn add_processed_bytes(n: u64) {
    if n == 0 { return; }
    PROCESSED_BYTES_TL.with(|c| c.set(c.get().saturating_add(n)));
}

pub fn add_redactions(n: u64) {
    if n == 0 { return; }
    REDACTIONS_TL.with(|c| c.set(c.get().saturating_add(n)));
}

pub fn snapshot() -> (u64, u64) {
    let bytes = PROCESSED_BYTES_TL.with(|c| c.get());
    let reds = REDACTIONS_TL.with(|c| c.get());
    (bytes, reds)
}

pub fn reset() {
    PROCESSED_BYTES_TL.with(|c| c.set(0));
    REDACTIONS_TL.with(|c| c.set(0));
}

// Global fallback counters (not thread-local) so telemetry task can observe end-to-end usage
static AUDIO_DIARIZATION_FALLBACK: AtomicU64 = AtomicU64::new(0);
static AUDIO_REDACTION_NOOP: AtomicU64 = AtomicU64::new(0);
static DICOM_OCR_STUB: AtomicU64 = AtomicU64::new(0);
static DICOM_NIFTI_STUB: AtomicU64 = AtomicU64::new(0);
static NLP_REGEX_FALLBACK: AtomicU64 = AtomicU64::new(0);

pub fn inc_audio_diarization_fallback() { AUDIO_DIARIZATION_FALLBACK.fetch_add(1, Ordering::Relaxed); }
pub fn inc_audio_redaction_noop() { AUDIO_REDACTION_NOOP.fetch_add(1, Ordering::Relaxed); }
pub fn inc_dicom_ocr_stub() { DICOM_OCR_STUB.fetch_add(1, Ordering::Relaxed); }
pub fn inc_dicom_nifti_stub() { DICOM_NIFTI_STUB.fetch_add(1, Ordering::Relaxed); }
pub fn inc_nlp_regex_fallback() { NLP_REGEX_FALLBACK.fetch_add(1, Ordering::Relaxed); }

pub fn snapshot_fallbacks() -> (u64, u64, u64, u64, u64) {
    (
        AUDIO_DIARIZATION_FALLBACK.load(Ordering::Relaxed),
        AUDIO_REDACTION_NOOP.load(Ordering::Relaxed),
        DICOM_OCR_STUB.load(Ordering::Relaxed),
        DICOM_NIFTI_STUB.load(Ordering::Relaxed),
        NLP_REGEX_FALLBACK.load(Ordering::Relaxed),
    )
}
