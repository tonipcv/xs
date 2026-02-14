use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use xase_sidecar::watermark::{watermark_audio, detect_watermark};
use hound::{WavSpec, WavWriter};
use std::io::Cursor;

fn generate_test_audio(sample_rate: u32, duration_secs: f32) -> Vec<u8> {
    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let num_samples = (sample_rate as f32 * duration_secs) as usize;
    let frequency = 440.0;

    let samples: Vec<i16> = (0..num_samples)
        .map(|i| {
            let t = i as f32 / sample_rate as f32;
            let sample = (2.0 * std::f32::consts::PI * frequency * t).sin();
            (sample * i16::MAX as f32 * 0.5) as i16
        })
        .collect();

    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = WavWriter::new(&mut cursor, spec).unwrap();
        for sample in samples {
            writer.write_sample(sample).unwrap();
        }
        writer.finalize().unwrap();
    }

    cursor.into_inner()
}

fn benchmark_watermark_embedding(c: &mut Criterion) {
    let mut group = c.benchmark_group("watermark_embedding");
    
    for size_mb in [1, 10, 50, 100].iter() {
        let duration = (*size_mb as f32) * 10.0; // ~1MB per 10 seconds at 16kHz
        let audio = generate_test_audio(16000, duration);
        
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{}MB", size_mb)),
            &audio,
            |b, audio| {
                b.iter(|| {
                    watermark_audio(black_box(audio.clone()), "contract_bench").unwrap()
                });
            },
        );
    }
    
    group.finish();
}

fn benchmark_watermark_detection(c: &mut Criterion) {
    let mut group = c.benchmark_group("watermark_detection");
    
    for size_mb in [1, 10, 50].iter() {
        let duration = (*size_mb as f32) * 10.0;
        let audio = generate_test_audio(16000, duration);
        let watermarked = watermark_audio(audio, "contract_bench").unwrap();
        
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{}MB", size_mb)),
            &watermarked,
            |b, audio| {
                b.iter(|| {
                    detect_watermark(black_box(audio.clone())).unwrap()
                });
            },
        );
    }
    
    group.finish();
}

fn benchmark_cache_operations(c: &mut Criterion) {
    use xase_sidecar::cache::SegmentCache;
    
    let mut group = c.benchmark_group("cache_operations");
    let mut cache = SegmentCache::new(1024 * 1024 * 100); // 100 MB
    
    // Benchmark cache insert
    group.bench_function("insert_1MB", |b| {
        let data = vec![0u8; 1024 * 1024];
        let mut counter = 0;
        b.iter(|| {
            let key = format!("seg_{}", counter);
            cache.insert(black_box(key), black_box(data.clone()));
            counter += 1;
        });
    });
    
    // Benchmark cache get (hit)
    cache.insert("seg_test".to_string(), vec![0u8; 1024 * 1024]);
    group.bench_function("get_hit_1MB", |b| {
        b.iter(|| {
            cache.get(black_box("seg_test"))
        });
    });
    
    // Benchmark cache get (miss)
    group.bench_function("get_miss", |b| {
        b.iter(|| {
            cache.get(black_box("seg_nonexistent"))
        });
    });
    
    group.finish();
}

criterion_group!(
    benches,
    benchmark_watermark_embedding,
    benchmark_watermark_detection,
    benchmark_cache_operations
);
criterion_main!(benches);
