/**
 * Audio Quality Metrics
 * SNR detection, codec validation, clipping detection
 */

import { spawn } from 'child_process';

export interface AudioQualityMetrics {
  snrDb: number;
  codec: string;
  sampleRate: number;
  bitDepth: number;
  isClipped: boolean;
  clipPercentage: number;
  rmsLevel: number;
  peakLevel: number;
  dynamicRange: number;
  qualityScore: number;
}

export interface AudioQualityConfig {
  minSnrDb?: number;
  maxClipPercentage?: number;
  minBitDepth?: number;
  preferredCodecs?: string[];
}

export class AudioQualityAnalyzer {
  private config: AudioQualityConfig;

  constructor(config?: AudioQualityConfig) {
    this.config = {
      minSnrDb: 20,
      maxClipPercentage: 1.0,
      minBitDepth: 16,
      preferredCodecs: ['flac', 'wav', 'aac', 'mp3'],
      ...config,
    };
  }

  /**
   * Analyze audio quality using ffmpeg
   */
  async analyzeAudio(audioPath: string): Promise<AudioQualityMetrics> {
    // Get audio info using ffprobe
    const audioInfo = await this.getAudioInfo(audioPath);
    
    // Detect clipping using ffmpeg volumedetect
    const clipInfo = await this.detectClipping(audioPath);
    
    // Estimate SNR (simplified - real SNR needs clean reference)
    const snrDb = this.estimateSNR(audioInfo, clipInfo);
    
    // Calculate quality score
    const qualityScore = this.calculateQualityScore(audioInfo, clipInfo, snrDb);

    return {
      snrDb,
      codec: audioInfo.codec,
      sampleRate: audioInfo.sampleRate,
      bitDepth: audioInfo.bitDepth,
      isClipped: clipInfo.isClipped,
      clipPercentage: clipInfo.clipPercentage,
      rmsLevel: clipInfo.rmsLevel,
      peakLevel: clipInfo.peakLevel,
      dynamicRange: clipInfo.dynamicRange,
      qualityScore,
    };
  }

  private async getAudioInfo(audioPath: string): Promise<{
    codec: string;
    sampleRate: number;
    bitDepth: number;
    channels: number;
  }> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        audioPath,
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      ffprobe.on('close', (code: number | null) => {
        if (code !== 0) {
          reject(new Error('ffprobe failed'));
          return;
        }
        try {
          const info = JSON.parse(output);
          const stream = info.streams?.find((s: any) => s.codec_type === 'audio') || {};
          
          resolve({
            codec: stream.codec_name || 'unknown',
            sampleRate: parseInt(stream.sample_rate) || 44100,
            bitDepth: parseInt(stream.bits_per_raw_sample) || 
                      parseInt(stream.bits_per_sample) || 16,
            channels: stream.channels || 1,
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  private async detectClipping(audioPath: string): Promise<{
    isClipped: boolean;
    clipPercentage: number;
    rmsLevel: number;
    peakLevel: number;
    dynamicRange: number;
  }> {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', audioPath,
        '-af', 'volumedetect',
        '-f', 'null',
        '-',
      ]);

      let output = '';
      ffmpeg.stderr.on('data', (data: Buffer) => { output += data.toString(); });
      
      ffmpeg.on('close', () => {
        // Parse volumedetect output
        const meanVolume = this.parseVolume(output, 'mean_volume');
        const maxVolume = this.parseVolume(output, 'max_volume');
        
        // Estimate clipping based on max volume
        // If max volume is near 0dB, likely clipped
        const isClipped = maxVolume > -0.5;
        const clipPercentage = isClipped ? this.estimateClipPercentage(output) : 0;
        
        // Calculate dynamic range
        const dynamicRange = maxVolume - meanVolume;
        
        resolve({
          isClipped,
          clipPercentage,
          rmsLevel: meanVolume,
          peakLevel: maxVolume,
          dynamicRange,
        });
      });
    });
  }

  private parseVolume(output: string, key: string): number {
    const match = output.match(new RegExp(`${key}:\\s*([\\d.-]+)\\s*dB`));
    return match ? parseFloat(match[1]) : -70;
  }

  private estimateClipPercentage(output: string): number {
    // Look for "max_volume" near 0dB as indicator of clipping
    const maxVolMatch = output.match(/max_volume:\s*([\d.-]+)\s*dB/);
    if (maxVolMatch) {
      const maxVol = parseFloat(maxVolMatch[1]);
      if (maxVol > -0.1) return 5.0; // Heavily clipped
      if (maxVol > -0.5) return 2.0; // Moderately clipped
      if (maxVol > -1.0) return 0.5; // Slightly clipped
    }
    return 0;
  }

  private estimateSNR(
    audioInfo: { codec: string; sampleRate: number; bitDepth: number },
    clipInfo: { rmsLevel: number; dynamicRange: number }
  ): number {
    // Simplified SNR estimation based on codec and bit depth
    let baseSnr = 60; // Default SNR in dB
    
    // Adjust based on bit depth
    if (audioInfo.bitDepth >= 24) baseSnr = 90;
    else if (audioInfo.bitDepth >= 16) baseSnr = 70;
    else if (audioInfo.bitDepth >= 8) baseSnr = 40;
    
    // Adjust based on codec
    if (['flac', 'alac', 'wavpack'].includes(audioInfo.codec)) {
      baseSnr += 10; // Lossless codecs
    } else if (['mp3', 'aac', 'ogg'].includes(audioInfo.codec)) {
      baseSnr -= 10; // Lossy codecs
    }
    
    // Reduce SNR if clipped
    if (clipInfo.dynamicRange < 20) {
      baseSnr -= 10;
    }
    
    return Math.max(20, Math.min(100, baseSnr));
  }

  private calculateQualityScore(
    audioInfo: { codec: string; bitDepth: number },
    clipInfo: { isClipped: boolean; clipPercentage: number; dynamicRange: number },
    snrDb: number
  ): number {
    let score = 100;
    
    // Penalty for clipping
    if (clipInfo.isClipped) {
      score -= clipInfo.clipPercentage * 10;
    }
    
    // Penalty for low SNR
    if (snrDb < (this.config.minSnrDb || 20)) {
      score -= (20 - snrDb) * 2;
    }
    
    // Penalty for low bit depth
    if (audioInfo.bitDepth < (this.config.minBitDepth || 16)) {
      score -= 20;
    }
    
    // Bonus for preferred codecs
    if (this.config.preferredCodecs?.includes(audioInfo.codec)) {
      score += 5;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Validate audio quality against thresholds
   */
  validateQuality(metrics: AudioQualityMetrics): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    if (metrics.isClipped && metrics.clipPercentage > (this.config.maxClipPercentage || 1)) {
      issues.push(`Audio is clipped (${metrics.clipPercentage.toFixed(2)}%)`);
    }
    
    if (metrics.snrDb < (this.config.minSnrDb || 20)) {
      issues.push(`Low SNR: ${metrics.snrDb.toFixed(1)}dB`);
    }
    
    if (metrics.bitDepth < (this.config.minBitDepth || 16)) {
      issues.push(`Low bit depth: ${metrics.bitDepth}-bit`);
    }
    
    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

export default AudioQualityAnalyzer;
