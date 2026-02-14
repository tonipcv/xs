use lru::LruCache;
use std::num::NonZeroUsize;

pub struct SegmentCache {
    cache: LruCache<String, Vec<u8>>,
    max_bytes: usize,
    current_bytes: usize,
}

impl SegmentCache {
    pub fn new(max_bytes: usize) -> Self {
        Self {
            cache: LruCache::new(NonZeroUsize::new(100000).unwrap()),
            max_bytes,
            current_bytes: 0,
        }
    }

    pub fn get(&mut self, key: &str) -> Option<Vec<u8>> {
        self.cache.get(key).cloned()
    }

    pub fn insert(&mut self, key: String, data: Vec<u8>) {
        let size = data.len();

        // Evict if needed
        while self.current_bytes + size > self.max_bytes && !self.cache.is_empty() {
            if let Some((_, evicted)) = self.cache.pop_lru() {
                self.current_bytes -= evicted.len();
            }
        }

        self.cache.put(key, data);
        self.current_bytes += size;
    }

    pub fn contains(&self, key: &str) -> bool {
        self.cache.contains(key)
    }

    pub fn len(&self) -> usize {
        self.cache.len()
    }

    pub fn current_bytes(&self) -> usize {
        self.current_bytes
    }

    pub fn max_bytes(&self) -> usize {
        self.max_bytes
    }
}
