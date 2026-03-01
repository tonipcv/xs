/**
 * Audio Quality Metrics
 * Integration with librosa and ffprobe for comprehensive audio analysis
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface AudioMetrics {
  // Basic properties
  duration: number;
  sampleRate: number;
  channels: number;
  bitRate: number;
  codec: string;
  format: string;

  // Quality metrics
  snr?: number; // Signal-to-Noise Ratio
  thd?: number; // Total Harmonic Distortion
  dynamicRange?: number;
  peakLevel: number;
  rmsLevel: number;
  lufs?: number; // Loudness Units Full Scale

  // Spectral analysis
  spectralCentroid?: number;
  spectralBandwidth?: number;
  spectralRolloff?: number;
  zeroCrossingRate?: number;

  // Advanced features
  mfcc?: number[]; // Mel-frequency cepstral coefficients
  chromagram?: number[][];
  tempo?: number;
  key?: string;

  // Quality score
  overallQuality: number; // 0-100
}

/**
 * Extract audio metadata using ffprobe
 */
export async function extractAudioMetadata(filePath: string): Promise<Partial<AudioMetrics>> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    );

    const data = JSON.parse(stdout);
    const audioStream = data.streams.find((s: any) => s.codec_type === 'audio');

    if (!audioStream) {
      throw new Error('No audio stream found');
    }

    return {
      duration: parseFloat(data.format.duration),
      sampleRate: parseInt(audioStream.sample_rate),
      channels: audioStream.channels,
      bitRate: parseInt(data.format.bit_rate),
      codec: audioStream.codec_name,
      format: data.format.format_name,
    };
  } catch (error) {
    console.error('ffprobe error:', error);
    throw new Error(`Failed to extract audio metadata: ${error}`);
  }
}

/**
 * Analyze audio quality using Python/librosa
 */
export async function analyzeAudioQuality(filePath: string): Promise<Partial<AudioMetrics>> {
  const pythonScript = `
import sys
import json
import librosa
import numpy as np

def analyze_audio(file_path):
    # Load audio
    y, sr = librosa.load(file_path, sr=None)
    
    # Basic metrics
    duration = librosa.get_duration(y=y, sr=sr)
    
    # RMS and peak levels
    rms = librosa.feature.rms(y=y)[0]
    rms_db = 20 * np.log10(np.mean(rms) + 1e-10)
    peak_db = 20 * np.log10(np.max(np.abs(y)) + 1e-10)
    
    # Dynamic range
    dynamic_range = peak_db - rms_db
    
    # Spectral features
    spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
    spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
    zero_crossing_rate = librosa.feature.zero_crossing_rate(y)[0]
    
    # MFCCs
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_mean = np.mean(mfccs, axis=1).tolist()
    
    # Chromagram
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    
    # Tempo estimation
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    
    # Calculate quality score
    quality_score = calculate_quality_score(
        rms_db, peak_db, dynamic_range, 
        np.mean(spectral_centroids), np.mean(zero_crossing_rate)
    )
    
    return {
        'duration': float(duration),
        'rmsLevel': float(rms_db),
        'peakLevel': float(peak_db),
        'dynamicRange': float(dynamic_range),
        'spectralCentroid': float(np.mean(spectral_centroids)),
        'spectralBandwidth': float(np.mean(spectral_bandwidth)),
        'spectralRolloff': float(np.mean(spectral_rolloff)),
        'zeroCrossingRate': float(np.mean(zero_crossing_rate)),
        'mfcc': mfcc_mean,
        'tempo': float(tempo),
        'overallQuality': quality_score
    }

def calculate_quality_score(rms_db, peak_db, dynamic_range, spectral_centroid, zcr):
    score = 50  # Base score
    
    # Penalize clipping (peak near 0 dB)
    if peak_db > -1:
        score -= 20
    elif peak_db > -3:
        score -= 10
    
    # Reward good dynamic range
    if dynamic_range > 20:
        score += 15
    elif dynamic_range > 10:
        score += 10
    
    # Penalize very low RMS (too quiet)
    if rms_db < -40:
        score -= 15
    elif rms_db < -30:
        score -= 5
    
    # Reward appropriate spectral content
    if 1000 < spectral_centroid < 4000:
        score += 10
    
    # Penalize excessive zero crossings (noise)
    if zcr > 0.3:
        score -= 10
    
    return max(0, min(100, score))

if __name__ == '__main__':
    file_path = sys.argv[1]
    result = analyze_audio(file_path)
    print(json.dumps(result))
`;

  try {
    // Write Python script to temp file
    const tempDir = await fs.mkdtemp(path.join('/tmp', 'audio-analysis-'));
    const scriptPath = path.join(tempDir, 'analyze.py');
    await fs.writeFile(scriptPath, pythonScript);

    // Execute Python script
    const { stdout } = await execAsync(`python3 "${scriptPath}" "${filePath}"`);
    
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });

    return JSON.parse(stdout);
  } catch (error) {
    console.error('librosa analysis error:', error);
    throw new Error(`Failed to analyze audio quality: ${error}`);
  }
}

/**
 * Calculate Signal-to-Noise Ratio
 */
export async function calculateSNR(filePath: string): Promise<number> {
  const pythonScript = `
import sys
import librosa
import numpy as np

def calculate_snr(file_path):
    y, sr = librosa.load(file_path, sr=None)
    
    # Simple SNR estimation
    # Assume first 0.5s is noise
    noise_duration = min(0.5, len(y) / sr * 0.1)
    noise_samples = int(noise_duration * sr)
    
    noise = y[:noise_samples]
    signal = y[noise_samples:]
    
    noise_power = np.mean(noise ** 2)
    signal_power = np.mean(signal ** 2)
    
    if noise_power == 0:
        return 100.0
    
    snr = 10 * np.log10(signal_power / noise_power)
    return float(snr)

if __name__ == '__main__':
    file_path = sys.argv[1]
    snr = calculate_snr(file_path)
    print(snr)
`;

  try {
    const tempDir = await fs.mkdtemp(path.join('/tmp', 'snr-calc-'));
    const scriptPath = path.join(tempDir, 'snr.py');
    await fs.writeFile(scriptPath, pythonScript);

    const { stdout } = await execAsync(`python3 "${scriptPath}" "${filePath}"`);
    
    await fs.rm(tempDir, { recursive: true, force: true });

    return parseFloat(stdout.trim());
  } catch (error) {
    console.error('SNR calculation error:', error);
    return 0;
  }
}

/**
 * Get comprehensive audio metrics
 */
export async function getAudioMetrics(filePath: string): Promise<AudioMetrics> {
  try {
    // Run analyses in parallel
    const [metadata, quality, snr] = await Promise.all([
      extractAudioMetadata(filePath),
      analyzeAudioQuality(filePath),
      calculateSNR(filePath),
    ]);

    return {
      ...metadata,
      ...quality,
      snr,
      duration: metadata.duration || 0,
      sampleRate: metadata.sampleRate || 0,
      channels: metadata.channels || 0,
      bitRate: metadata.bitRate || 0,
      codec: metadata.codec || 'unknown',
      format: metadata.format || 'unknown',
      peakLevel: quality.peakLevel || 0,
      rmsLevel: quality.rmsLevel || 0,
      overallQuality: quality.overallQuality || 0,
    } as AudioMetrics;
  } catch (error) {
    console.error('Error getting audio metrics:', error);
    throw error;
  }
}

/**
 * Validate audio quality against thresholds
 */
export function validateAudioQuality(
  metrics: AudioMetrics,
  thresholds: Partial<AudioMetrics> = {}
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check sample rate
  if (thresholds.sampleRate && metrics.sampleRate < thresholds.sampleRate) {
    issues.push(`Sample rate too low: ${metrics.sampleRate}Hz (minimum: ${thresholds.sampleRate}Hz)`);
  }

  // Check bit rate
  if (thresholds.bitRate && metrics.bitRate < thresholds.bitRate) {
    issues.push(`Bit rate too low: ${metrics.bitRate}bps (minimum: ${thresholds.bitRate}bps)`);
  }

  // Check SNR
  if (thresholds.snr && metrics.snr && metrics.snr < thresholds.snr) {
    issues.push(`SNR too low: ${metrics.snr.toFixed(2)}dB (minimum: ${thresholds.snr}dB)`);
  }

  // Check overall quality
  if (thresholds.overallQuality && metrics.overallQuality < thresholds.overallQuality) {
    issues.push(`Quality score too low: ${metrics.overallQuality} (minimum: ${thresholds.overallQuality})`);
  }

  // Check for clipping
  if (metrics.peakLevel > -1) {
    issues.push('Audio clipping detected');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Generate audio quality report
 */
export function generateQualityReport(metrics: AudioMetrics): string {
  const lines = [
    '=== Audio Quality Report ===',
    '',
    '## Basic Properties',
    `Duration: ${metrics.duration.toFixed(2)}s`,
    `Sample Rate: ${metrics.sampleRate}Hz`,
    `Channels: ${metrics.channels}`,
    `Bit Rate: ${metrics.bitRate}bps`,
    `Codec: ${metrics.codec}`,
    `Format: ${metrics.format}`,
    '',
    '## Quality Metrics',
    `Overall Quality Score: ${metrics.overallQuality}/100`,
    `Peak Level: ${metrics.peakLevel.toFixed(2)}dB`,
    `RMS Level: ${metrics.rmsLevel.toFixed(2)}dB`,
    `Dynamic Range: ${metrics.dynamicRange?.toFixed(2)}dB`,
    metrics.snr ? `SNR: ${metrics.snr.toFixed(2)}dB` : '',
    '',
    '## Spectral Analysis',
    metrics.spectralCentroid ? `Spectral Centroid: ${metrics.spectralCentroid.toFixed(2)}Hz` : '',
    metrics.spectralBandwidth ? `Spectral Bandwidth: ${metrics.spectralBandwidth.toFixed(2)}Hz` : '',
    metrics.zeroCrossingRate ? `Zero Crossing Rate: ${metrics.zeroCrossingRate.toFixed(4)}` : '',
    metrics.tempo ? `Tempo: ${metrics.tempo.toFixed(1)} BPM` : '',
  ];

  return lines.filter(l => l !== '').join('\n');
}
