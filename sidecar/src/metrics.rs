use std::sync::atomic::{AtomicU64, Ordering};

static PROCESSED_BYTES: AtomicU64 = AtomicU64::new(0);
static REDACTIONS: AtomicU64 = AtomicU64::new(0);

pub fn add_processed_bytes(n: u64) {
    PROCESSED_BYTES.fetch_add(n, Ordering::Relaxed);
}

pub fn add_redactions(n: u64) {
    if n > 0 { REDACTIONS.fetch_add(n, Ordering::Relaxed); }
}

pub fn snapshot() -> (u64, u64) {
    (
        PROCESSED_BYTES.load(Ordering::Relaxed),
        REDACTIONS.load(Ordering::Relaxed),
    )
}

pub fn reset() {
    PROCESSED_BYTES.store(0, Ordering::Relaxed);
    REDACTIONS.store(0, Ordering::Relaxed);
}
