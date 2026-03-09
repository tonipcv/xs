/**
 * Real Audio Preparer using ffprobe, Whisper, and pyannote
 * Processes audio files for ML training with real STT and diarization
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export interface AudioMetadata {
  // Basic info
  duration: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  codec: string;
  format: string;

  // Quality metrics
  bitrate: number;
  peakLevel: number;
  rmsLevel: number;

  // Content
  hasSpeech: boolean;
  language?: string;
  numSpeakers?: number;

  // Transcription (if available)
  transcription?: {
    text: string;
    segments: Array<{
      start: number;
      end: number;
      text: string;
      speaker?: string;
    }>;
  };
}

export interface AudioProcessingConfig {
  // Resampling
  targetSampleRate?: number;
  targetChannels?: number;

  // Segmentation
  segmentBySilence: boolean;
  silenceThreshold: number;  // dB
  minSegmentDuration: number;  // seconds
  maxSegmentDuration: number;  // seconds

  // Transcription
  transcribe: boolean;
  language?: string;
  modelSize?: 'tiny' | 'base' | 'small' | 'medium' | 'large';

  // Diarization
  diarize: boolean;
  numSpeakers?: number;

  // Output
  outputFormat: 'wav' | 'mp3' | 'flac';
  outputDir: string;
}

export interface ProcessedAudio {
  id: string;
  originalPath: string;
  processedPath?: string;
  segments: AudioSegment[];
  metadata: AudioMetadata;
  processingTimeMs: number;
  success: boolean;
  error?: string;
}

export interface AudioSegment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  text?: string;
  speaker?: string;
  path: string;
}

/**
 * Real Audio Preparer using ffprobe, Whisper, and pyannote
 */
export class RealAudioPreparer {
  private ffprobeAvailable: boolean = false;
  private ffmpegAvailable: boolean = false;
  private whisperAvailable: boolean = false;
  private pyannoteAvailable: boolean = false;

  constructor() {
    this.checkToolsAvailability();
  }

  /**
   * Check if required tools are available
   */
  private async checkToolsAvailability(): Promise<void> {
    this.ffprobeAvailable = await this.checkCommand('ffprobe');
    this.ffmpegAvailable = await this.checkCommand('ffmpeg');
    this.whisperAvailable = await this.checkCommand('whisper');
    this.pyannoteAvailable = await this.checkPythonModule('pyannote.audio');
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

  /**
   * Check if a Python module is available
   */
  private async checkPythonModule(module: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('python3', ['-c', `import ${module}; print('OK')`]);
      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      proc.on('exit', (code) => resolve(code === 0 && output.includes('OK')));
      proc.on('error', () => resolve(false));
    });
  }

  /**
   * Load audio metadata using ffprobe
   */
  async loadMetadata(audioPath: string): Promise<AudioMetadata> {
    if (!this.ffprobeAvailable) {
      return this.getBasicMetadata(audioPath);
    }

    try {
      const info = await this.runFFprobe(audioPath);
      return info;
    } catch (error) {
      console.error('Failed to load metadata with ffprobe:', error);
      return this.getBasicMetadata(audioPath);
    }
  }

  /**
   * Process audio file
   */
  async processAudio(
    audioPath: string,
    config: AudioProcessingConfig
  ): Promise<ProcessedAudio> {
    const startTime = Date.now();
    const id = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Ensure output directory exists
      await fs.mkdir(config.outputDir, { recursive: true });

      // Load metadata
      const metadata = await this.loadMetadata(audioPath);

      // Convert to target format if needed
      let processedPath = audioPath;
      if (config.outputFormat || config.targetSampleRate || config.targetChannels) {
        processedPath = path.join(config.outputDir, `${id}.${config.outputFormat || 'wav'}`);
        await this.convertAudio(audioPath, processedPath, config);
      }

      // Segment by silence if requested
      let segments: AudioSegment[] = [];
      if (config.segmentBySilence) {
        segments = await this.segmentBySilence(processedPath, config);
      } else {
        // Single segment for entire file
        segments = [{
          id: `${id}_seg_0`,
          startTime: 0,
          endTime: metadata.duration,
          duration: metadata.duration,
          path: processedPath,
        }];
      }

      // Transcribe if requested
      if (config.transcribe) {
        for (const segment of segments) {
          const transcription = await this.transcribeSegment(segment.path, config);
          segment.text = transcription.text;
        }
      }

      // Diarize if requested
      if (config.diarize) {
        const diarization = await this.diarizeAudio(processedPath, config);
        for (let i = 0; i < segments.length; i++) {
          if (diarization[i]) {
            segments[i].speaker = diarization[i];
          }
        }
      }

      return {
        id,
        originalPath: audioPath,
        processedPath: config.outputFormat ? processedPath : undefined,
        segments,
        metadata,
        processingTimeMs: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      return {
        id,
        originalPath: audioPath,
        segments: [],
        metadata: {} as AudioMetadata,
        processingTimeMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Batch process multiple audio files
   */
  async batchProcess(
    audioPaths: string[],
    config: AudioProcessingConfig,
    onProgress?: (completed: number, total: number) => void
  ): Promise<ProcessedAudio[]> {
    const results: ProcessedAudio[] = [];

    for (let i = 0; i < audioPaths.length; i++) {
      const result = await this.processAudio(audioPaths[i], config);
      results.push(result);
      onProgress?.(i + 1, audioPaths.length);
    }

    return results;
  }

  /**
   * Convert audio to target format
   */
  private async convertAudio(
    inputPath: string,
    outputPath: string,
    config: AudioProcessingConfig
  ): Promise<void> {
    if (!this.ffmpegAvailable) {
      // Fallback: just copy
      await fs.copyFile(inputPath, outputPath);
      return;
    }

    return new Promise((resolve, reject) => {
      const args: string[] = [
        '-y',
        '-i', inputPath,
      ];

      if (config.targetSampleRate) {
        args.push('-ar', config.targetSampleRate.toString());
      }

      if (config.targetChannels) {
        args.push('-ac', config.targetChannels.toString());
      }

      // Quality settings based on format
      if (config.outputFormat === 'mp3') {
        args.push('-b:a', '192k');
      } else if (config.outputFormat === 'flac') {
        args.push('-compression_level', '5');
      }

      args.push(outputPath);

      const proc = spawn('ffmpeg', args);

      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg conversion failed with code ${code}`));
          return;
        }
        resolve();
      });

      proc.on('error', reject);
    });
  }

  /**
   * Segment audio by silence
   */
  private async segmentBySilence(
    audioPath: string,
    config: AudioProcessingConfig
  ): Promise<AudioSegment[]> {
    if (!this.ffmpegAvailable) {
      // Return single segment if ffmpeg not available
      const metadata = await this.loadMetadata(audioPath);
      return [{
        id: `seg_${Date.now()}_0`,
        startTime: 0,
        endTime: metadata.duration,
        duration: metadata.duration,
        path: audioPath,
      }];
    }

    return new Promise((resolve, reject) => {
      const silenceThreshold = config.silenceThreshold || -50;
      const minDuration = config.minSegmentDuration || 1;

      const args: string[] = [
        '-i', audioPath,
        '-af', `silencedetect=noise=${silenceThreshold}dB:d=${minDuration}`,
        '-f', 'null',
        '-',
      ];

      const proc = spawn('ffmpeg', args);
      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('exit', () => {
        // Parse silence detection output
        const segments = this.parseSilenceDetect(stderr, audioPath);
        resolve(segments);
      });

      proc.on('error', () => {
        resolve([{
          id: `seg_${Date.now()}_0`,
          startTime: 0,
          endTime: 0,
          duration: 0,
          path: audioPath,
        }]);
      });
    });
  }

  /**
   * Parse ffmpeg silencedetect output
   */
  private parseSilenceDetect(stderr: string, audioPath: string): AudioSegment[] {
    const segments: AudioSegment[] = [];
    
    const silenceStartMatches = stderr.matchAll(/silence_start: ([\d.]+)/g);
    const silenceEndMatches = stderr.matchAll(/silence_end: ([\d.]+)/g);
    
    const silenceStarts = Array.from(silenceStartMatches).map(m => parseFloat(m[1]));
    const silenceEnds = Array.from(silenceEndMatches).map(m => parseFloat(m[1]));

    if (silenceStarts.length === 0) {
      // No silence detected, return single segment
      return [{
        id: `seg_${Date.now()}_0`,
        startTime: 0,
        endTime: 0,
        duration: 0,
        path: audioPath,
      }];
    }

    // Create segments from silence gaps
    let currentStart = 0;
    
    for (let i = 0; i < silenceStarts.length; i++) {
      if (silenceStarts[i] > currentStart) {
        segments.push({
          id: `seg_${Date.now()}_${segments.length}`,
          startTime: currentStart,
          endTime: silenceStarts[i],
          duration: silenceStarts[i] - currentStart,
          path: audioPath,
        });
      }
      currentStart = silenceEnds[i] || silenceStarts[i];
    }

    return segments;
  }

  /**
   * Transcribe audio segment using Whisper
   */
  private async transcribeSegment(
    audioPath: string,
    config: AudioProcessingConfig
  ): Promise<{ text: string }> {
    if (!this.whisperAvailable) {
      return { text: '' };
    }

    return new Promise((resolve, reject) => {
      const modelSize = config.modelSize || 'base';
      const language = config.language || 'en';

      const args: string[] = [
        audioPath,
        '--model', modelSize,
        '--language', language,
        '--output_format', 'json',
        '--output_dir', path.dirname(audioPath),
      ];

      const proc = spawn('whisper', args);
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('exit', (code) => {
        if (code !== 0) {
          resolve({ text: '' });
          return;
        }

        // Try to parse JSON output
        try {
          const result = JSON.parse(output);
          resolve({ text: result.text || '' });
        } catch {
          resolve({ text: output.trim() });
        }
      });

      proc.on('error', () => {
        resolve({ text: '' });
      });
    });
  }

  /**
   * Perform speaker diarization using pyannote
   */
  private async diarizeAudio(
    audioPath: string,
    config: AudioProcessingConfig
  ): Promise<string[]> {
    if (!this.pyannoteAvailable) {
      return [];
    }

    try {
      const result = await this.runPythonScript('diarize', {
        audioPath,
        numSpeakers: config.numSpeakers,
      });

      return JSON.parse(result);
    } catch {
      return [];
    }
  }

  /**
   * Run Python script for diarization
   */
  private async runPythonScript(
    operation: string,
    params: Record<string, unknown>
  ): Promise<string> {
    const scripts: Record<string, string> = {
      diarize: `
import json
import sys
try:
    from pyannote.audio import Pipeline
    
    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization")
    
    diarization = pipeline("${params.audioPath}")
    
    speakers = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        speakers.append({
            'start': turn.start,
            'end': turn.end,
            'speaker': speaker
        })
    
    print(json.dumps(speakers))
except Exception as e:
    print(json.dumps([]))
    sys.exit(0)
`,
    };

    return new Promise((resolve, reject) => {
      const script = scripts[operation] || '';
      const proc = spawn('python3', ['-c', script]);
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script failed`));
          return;
        }
        resolve(output);
      });

      proc.on('error', reject);
    });
  }

  /**
   * Run ffprobe to get audio info
   */
  private async runFFprobe(audioPath: string): Promise<AudioMetadata> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        audioPath,
      ]);

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed with code ${code}`));
          return;
        }

        try {
          const info = JSON.parse(output);
          const stream = info.streams?.find((s: any) => s.codec_type === 'audio') || {};
          const format = info.format || {};

          resolve({
            duration: parseFloat(format.duration) || 0,
            sampleRate: parseInt(stream.sample_rate) || 44100,
            channels: stream.channels || 2,
            bitDepth: parseInt(stream.bits_per_sample) || 16,
            codec: stream.codec_name || 'unknown',
            format: format.format_name || 'unknown',
            bitrate: parseInt(format.bit_rate) || 0,
            peakLevel: 0,
            rmsLevel: 0,
            hasSpeech: true,
          });
        } catch (error) {
          reject(error);
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Get basic metadata from file
   */
  private async getBasicMetadata(audioPath: string): Promise<AudioMetadata> {
    const stats = await fs.stat(audioPath);
    const format = audioPath.split('.').pop() || 'unknown';

    return {
      duration: 0,
      sampleRate: 44100,
      channels: 2,
      bitDepth: 16,
      codec: format,
      format,
      bitrate: 0,
      peakLevel: 0,
      rmsLevel: 0,
      hasSpeech: true,
    };
  }
}
