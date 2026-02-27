import * as fs from 'fs';
import * as path from 'path';

interface AudioMetadata {
  filename: string;
  transcript: string;
  duration: number;
  sampleRate: number;
  phiEntities: Array<{
    type: string;
    text: string;
    start: number;
    end: number;
  }>;
}

function generateWavHeader(dataSize: number, sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
  const header = Buffer.alloc(44);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  
  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // audio format (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // byte rate
  header.writeUInt16LE(numChannels * bitsPerSample / 8, 32); // block align
  header.writeUInt16LE(bitsPerSample, 34);
  
  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  
  return header;
}

function generateSyntheticAudio(durationSeconds: number, sampleRate: number): Buffer {
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const audioData = Buffer.alloc(numSamples * 2); // 16-bit samples
  
  // Generate synthetic audio (simple sine wave with noise)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    
    // Mix of frequencies to simulate speech-like patterns
    const fundamental = Math.sin(2 * Math.PI * 150 * t); // 150 Hz base
    const harmonic1 = 0.5 * Math.sin(2 * Math.PI * 300 * t);
    const harmonic2 = 0.3 * Math.sin(2 * Math.PI * 450 * t);
    const noise = (Math.random() - 0.5) * 0.1;
    
    // Amplitude modulation to simulate speech envelope
    const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t);
    
    const sample = (fundamental + harmonic1 + harmonic2 + noise) * envelope;
    const value = Math.floor(sample * 16000); // Scale to 16-bit range
    
    audioData.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2);
  }
  
  return audioData;
}

async function generateAudioSamples(): Promise<void> {
  const outputDir = path.join(__dirname, '../data/audio');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log('Generating synthetic audio samples with PHI...\n');
  
  const samples: AudioMetadata[] = [
    {
      filename: 'consultation_001.wav',
      transcript: 'Patient John Doe, medical record number 123456, date of birth August 15, 1980. Chief complaint is chest pain. Phone number is 617-555-0123. Address is 123 Main Street, Boston, MA 02101.',
      duration: 10,
      sampleRate: 16000,
      phiEntities: [
        { type: 'NAME', text: 'John Doe', start: 8, end: 16 },
        { type: 'MRN', text: '123456', start: 42, end: 48 },
        { type: 'DATE', text: 'August 15, 1980', start: 64, end: 79 },
        { type: 'PHONE', text: '617-555-0123', start: 127, end: 139 },
        { type: 'ADDRESS', text: '123 Main Street, Boston, MA 02101', start: 153, end: 186 }
      ]
    },
    {
      filename: 'followup_002.wav',
      transcript: 'This is Dr. Sarah Smith calling about patient Jane Wilson, SSN 123-45-6789. Follow-up appointment scheduled for March 15, 2024 at 2 PM. Please call back at 857-555-9876.',
      duration: 12,
      sampleRate: 16000,
      phiEntities: [
        { type: 'NAME', text: 'Dr. Sarah Smith', start: 8, end: 23 },
        { type: 'NAME', text: 'Jane Wilson', start: 47, end: 58 },
        { type: 'SSN', text: '123-45-6789', start: 64, end: 75 },
        { type: 'DATE', text: 'March 15, 2024', start: 113, end: 127 },
        { type: 'PHONE', text: '857-555-9876', start: 158, end: 170 }
      ]
    },
    {
      filename: 'emergency_003.wav',
      transcript: 'Emergency contact for Robert Johnson is his wife Mary Johnson at 508-555-4321. Patient admitted on January 10, 2024. Insurance ID is INS-789012.',
      duration: 8,
      sampleRate: 16000,
      phiEntities: [
        { type: 'NAME', text: 'Robert Johnson', start: 21, end: 35 },
        { type: 'NAME', text: 'Mary Johnson', start: 48, end: 60 },
        { type: 'PHONE', text: '508-555-4321', start: 64, end: 76 },
        { type: 'DATE', text: 'January 10, 2024', start: 96, end: 112 },
        { type: 'ID', text: 'INS-789012', start: 130, end: 140 }
      ]
    }
  ];
  
  for (const sample of samples) {
    const audioData = generateSyntheticAudio(sample.duration, sample.sampleRate);
    const header = generateWavHeader(audioData.length, sample.sampleRate, 1, 16);
    
    const wavFile = Buffer.concat([header, audioData]);
    const wavPath = path.join(outputDir, sample.filename);
    fs.writeFileSync(wavPath, wavFile);
    
    // Save metadata
    const metadataPath = path.join(outputDir, sample.filename.replace('.wav', '_metadata.json'));
    fs.writeFileSync(metadataPath, JSON.stringify(sample, null, 2));
    
    console.log(`✓ Created ${sample.filename} (${sample.duration}s, ${sample.phiEntities.length} PHI entities)`);
  }
  
  console.log('\nAudio samples generated successfully!');
  console.log(`Total files: ${samples.length * 2} (${samples.length} WAV + ${samples.length} metadata JSON)`);
}

if (require.main === module) {
  generateAudioSamples().catch(console.error);
}

export { generateAudioSamples };
