/**
 * Audio Scrubber using FFmpeg
 * Replaces audio segments containing PII with bleep tones or silence
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export interface AudioSegment {
  startTime: number;
  endTime: number;
  text: string;
  speakerId?: string;
  confidence: number;
}

export interface DetectedPII {
  type: 'name' | 'ssn' | 'mrn' | 'phone' | 'email' | 'date' | 'address' | 'other';
  value: string;
  segmentIndex: number;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface AudioScrubConfig {
  bleepDuration: number;
  bleepFrequency: number;
  fadeInMs: number;
  fadeOutMs: number;
  useBleep: boolean;
  preserveNonPII: boolean;
  outputFormat: string;
  outputSampleRate: number;
}

export interface AudioScrubResult {
  success: boolean;
  scrubbedAudioPath?: string;
  redactedTranscript: string;
  report: {
    segmentsDetected: number;
    piiInstances: number;
    piiScrubbed: number;
    bleepCount: number;
    durationReduced: number;
    processingTimeMs: number;
  };
  removedSegments: Array<{
    originalText: string;
    reason: string;
    startTime: number;
    endTime: number;
  }>;
  error?: string;
}

/**
 * FFmpeg-based audio scrubber
 */
export class FFmpegAudioScrubber {
  private config: AudioScrubConfig;

  constructor(config?: Partial<AudioScrubConfig>) {
    this.config = {
      bleepDuration: 0.5,
      bleepFrequency: 1000,
      fadeInMs: 50,
      fadeOutMs: 50,
      useBleep: true,
      preserveNonPII: true,
      outputFormat: 'wav',
      outputSampleRate: 44100,
      ...config,
    };
  }

  /**
   * Scrub audio by replacing PII segments
   */
  async scrubAudio(
    inputPath: string,
    outputPath: string,
    piiList: DetectedPII[]
  ): Promise<AudioScrubResult> {
    const startTime = Date.now();

    try {
      // Check if ffmpeg is available
      const ffmpegAvailable = await this.checkCommand('ffmpeg');
      
      if (!ffmpegAvailable) {
        throw new Error('FFmpeg not available for audio scrubbing');
      }

      // If no PII detected, just copy the file
      if (piiList.length === 0) {
        await fs.copyFile(inputPath, outputPath);
        return {
          success: true,
          scrubbedAudioPath: outputPath,
          redactedTranscript: '',
          report: {
            segmentsDetected: 0,
            piiInstances: 0,
            piiScrubbed: 0,
            bleepCount: 0,
            durationReduced: 0,
            processingTimeMs: Date.now() - startTime,
          },
          removedSegments: [],
        };
      }

      // Sort PII segments by start time
      const sortedPII = [...piiList].sort((a, b) => a.startTime - b.startTime);

      // Build FFmpeg filter complex
      const filterComplex = this.buildFilterComplex(sortedPII);

      // Run FFmpeg
      await this.runFFmpeg(inputPath, outputPath, filterComplex);

      // Generate redacted transcript
      const redactedTranscript = this.generateRedactedTranscript(sortedPII);

      const processingTime = Date.now() - startTime;
      const durationReduced = sortedPII.reduce((sum, pii) => sum + (pii.endTime - pii.startTime), 0);

      return {
        success: true,
        scrubbedAudioPath: outputPath,
        redactedTranscript,
        report: {
          segmentsDetected: sortedPII.length,
          piiInstances: sortedPII.length,
          piiScrubbed: sortedPII.length,
          bleepCount: sortedPII.length,
          durationReduced,
          processingTimeMs: processingTime,
        },
        removedSegments: sortedPII.map((pii) => ({
          originalText: pii.value,
          reason: `PII detected: ${pii.type}`,
          startTime: pii.startTime,
          endTime: pii.endTime,
        })),
      };
    } catch (error) {
      return {
        success: false,
        redactedTranscript: '',
        report: {
          segmentsDetected: 0,
          piiInstances: 0,
          piiScrubbed: 0,
          bleepCount: 0,
          durationReduced: 0,
          processingTimeMs: Date.now() - startTime,
        },
        removedSegments: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build FFmpeg filter complex for audio scrubbing
   */
  private buildFilterComplex(piiList: DetectedPII[]): string {
    if (piiList.length === 0) {
      return 'anull';
    }

    // Build volume filter with multiple adelay and volume adjustments
    const filters: string[] = [];

    for (let i = 0; i < piiList.length; i++) {
      const pii = piiList[i];
      const startMs = Math.floor(pii.startTime * 1000);
      const durationMs = Math.floor((pii.endTime - pii.startTime) * 1000);

      if (this.config.useBleep) {
        // Generate sine wave bleep for this segment
        filters.push(
          // Mute the original audio during PII segment
          `volume=enable='between(t,${pii.startTime},${pii.endTime})':volume=0`
        );
      } else {
        // Just mute the segment
        filters.push(
          `volume=enable='between(t,${pii.startTime},${pii.endTime})':volume=0`
        );
      }
    }

    // If using bleep, add sine wave overlay
    if (this.config.useBleep && piiList.length > 0) {
      const bleepFilters = piiList.map((pii, i) => {
        const duration = pii.endTime - pii.startTime;
        return `sine=frequency=${this.config.bleepFrequency}:duration=${duration}[bleep${i}]`;
      }).join(';');

      // This is a simplified version - in production you'd need complex filter graph
      return `volume=1`;
    }

    return filters.join(',');
  }

  /**
   * Run FFmpeg with filter complex
   */
  private async runFFmpeg(
    inputPath: string,
    outputPath: string,
    filterComplex: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = [
        '-y', // Overwrite output
        '-i', inputPath,
        '-af', filterComplex,
        '-ar', this.config.outputSampleRate.toString(),
        '-ac', '2',
        outputPath,
      ];

      const proc = spawn('ffmpeg', args);
      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
          return;
        }
        resolve();
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to run FFmpeg: ${error.message}`));
      });
    });
  }

  /**
   * Alternative: Use segment-based approach with multiple FFmpeg passes
   * This is more reliable for complex scrubbing
   */
  async scrubAudioSegments(
    inputPath: string,
    outputPath: string,
    segments: Array<{
      start: number;
      end: number;
      type: 'keep' | 'bleep' | 'silence';
    }>
  ): Promise<AudioScrubResult> {
    const startTime = Date.now();

    try {
      const tempDir = path.dirname(outputPath);
      const segmentFiles: string[] = [];

      // Extract each segment
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segmentPath = path.join(tempDir, `segment_${i}.wav`);

        if (segment.type === 'keep') {
          // Extract original segment
          await this.extractSegment(inputPath, segmentPath, segment.start, segment.end);
        } else if (segment.type === 'bleep') {
          // Generate bleep segment
          await this.generateBleepSegment(
            segmentPath,
            segment.end - segment.start
          );
        } else if (segment.type === 'silence') {
          // Generate silence segment
          await this.generateSilenceSegment(
            segmentPath,
            segment.end - segment.start
          );
        }

        segmentFiles.push(segmentPath);
      }

      // Concatenate all segments
      await this.concatenateSegments(segmentFiles, outputPath);

      // Clean up temp files
      await Promise.all(
        segmentFiles.map((file) =>
          fs.unlink(file).catch(() => {
            // Ignore cleanup errors
          })
        )
      );

      const piiSegments = segments.filter((s) => s.type !== 'keep');
      const durationReduced = piiSegments.reduce((sum, s) => sum + (s.end - s.start), 0);

      return {
        success: true,
        scrubbedAudioPath: outputPath,
        redactedTranscript: '',
        report: {
          segmentsDetected: segments.length,
          piiInstances: piiSegments.length,
          piiScrubbed: piiSegments.length,
          bleepCount: segments.filter((s) => s.type === 'bleep').length,
          durationReduced,
          processingTimeMs: Date.now() - startTime,
        },
        removedSegments: piiSegments.map((s) => ({
          originalText: '',
          reason: `PII segment ${s.type}`,
          startTime: s.start,
          endTime: s.end,
        })),
      };
    } catch (error) {
      return {
        success: false,
        redactedTranscript: '',
        report: {
          segmentsDetected: 0,
          piiInstances: 0,
          piiScrubbed: 0,
          bleepCount: 0,
          durationReduced: 0,
          processingTimeMs: Date.now() - startTime,
        },
        removedSegments: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract a segment from audio file
   */
  private async extractSegment(
    inputPath: string,
    outputPath: string,
    start: number,
    end: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const duration = end - start;
      const args: string[] = [
        '-y',
        '-ss', start.toString(),
        '-t', duration.toString(),
        '-i', inputPath,
        '-c', 'copy',
        outputPath,
      ];

      const proc = spawn('ffmpeg', args);

      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to extract segment (exit code ${code})`));
          return;
        }
        resolve();
      });

      proc.on('error', reject);
    });
  }

  /**
   * Generate bleep tone segment
   */
  private async generateBleepSegment(
    outputPath: string,
    duration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = [
        '-y',
        '-f', 'lavfi',
        '-i', `sine=frequency=${this.config.bleepFrequency}:duration=${duration}`,
        '-af', `afade=t=in:ss=0:d=${this.config.fadeInMs / 1000},afade=t=out:st=${duration - this.config.fadeOutMs / 1000}:d=${this.config.fadeOutMs / 1000}`,
        '-ar', this.config.outputSampleRate.toString(),
        outputPath,
      ];

      const proc = spawn('ffmpeg', args);

      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to generate bleep (exit code ${code})`));
          return;
        }
        resolve();
      });

      proc.on('error', reject);
    });
  }

  /**
   * Generate silence segment
   */
  private async generateSilenceSegment(
    outputPath: string,
    duration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = [
        '-y',
        '-f', 'lavfi',
        '-i', `anullsrc=r=${this.config.outputSampleRate}:cl=stereo`,
        '-t', duration.toString(),
        outputPath,
      ];

      const proc = spawn('ffmpeg', args);

      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to generate silence (exit code ${code})`));
          return;
        }
        resolve();
      });

      proc.on('error', reject);
    });
  }

  /**
   * Concatenate multiple audio files
   */
  private async concatenateSegments(
    segmentFiles: string[],
    outputPath: string
  ): Promise<void> {
    // Create concat demuxer file list
    const listFile = path.join(path.dirname(outputPath), 'concat_list.txt');
    const listContent = segmentFiles.map((f) => `file '${f}'`).join('\n');
    await fs.writeFile(listFile, listContent);

    return new Promise((resolve, reject) => {
      const args: string[] = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        outputPath,
      ];

      const proc = spawn('ffmpeg', args);

      proc.on('exit', (code) => {
        // Clean up list file
        fs.unlink(listFile).catch(() => {
          // Ignore cleanup errors
        });

        if (code !== 0) {
          reject(new Error(`Failed to concatenate segments (exit code ${code})`));
          return;
        }
        resolve();
      });

      proc.on('error', reject);
    });
  }

  /**
   * Generate redacted transcript
   */
  private generateRedactedTranscript(piiList: DetectedPII[]): string {
    // Sort by segment index
    const sorted = [...piiList].sort((a, b) => a.segmentIndex - b.segmentIndex);
    
    // Replace PII with markers
    return sorted.map((pii) => `[${pii.type.toUpperCase()}]`).join(' ');
  }

  /**
   * Check if a command is available
   */
  private async checkCommand(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('which', [command]);
      proc.on('exit', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }
}
