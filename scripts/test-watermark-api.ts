#!/usr/bin/env tsx
/**
 * Integration test for watermark detection API endpoints
 * 
 * Tests both /api/v1/watermark/detect and /api/v1/watermark/forensics
 */

import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const API_KEY = process.env.XASE_API_KEY || 'test_api_key';

async function createTestWavFile(): Promise<Buffer> {
  const sampleRate = 44100;
  const numChannels = 1;
  const bitsPerSample = 16;
  const duration = 1; // 1 second
  const numSamples = Math.floor(sampleRate * duration);
  
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const fileSize = 44 + dataSize;
  
  const buffer = Buffer.alloc(fileSize);
  
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize - 8, 4);
  buffer.write('WAVE', 8);
  
  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  
  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  // Generate sine wave
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const frequency = 440;
    const amplitude = 0.3;
    const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude;
    const sampleInt = Math.floor(sample * 32767);
    buffer.writeInt16LE(sampleInt, 44 + i * 2);
  }
  
  return buffer;
}

async function testDetectEndpoint() {
  console.log('\n🧪 Testing /api/v1/watermark/detect endpoint...\n');
  
  const audioBuffer = await createTestWavFile();
  const tempPath = join(tmpdir(), 'test-audio.wav');
  await writeFile(tempPath, audioBuffer);
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/watermark/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        audioHash: 'test_hash_123',
        audioUrl: `file://${tempPath}`,
      }),
    });
    
    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✅ Detect endpoint working');
      console.log(`   - Detected: ${data.detected}`);
      console.log(`   - Confidence: ${data.confidence}`);
      console.log(`   - Method: ${data.method}`);
      console.log(`   - Candidates checked: ${data.candidatesChecked}`);
    } else {
      console.log('❌ Detect endpoint failed');
    }
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

async function testForensicsEndpoint() {
  console.log('\n🧪 Testing /api/v1/watermark/forensics endpoint...\n');
  
  const audioBuffer = await createTestWavFile();
  
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
  formData.append('audio', blob, 'test-audio.wav');
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/watermark/forensics`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
      },
      body: formData,
    });
    
    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✅ Forensics endpoint working');
      console.log(`   - Detected: ${data.detected}`);
      if (data.matches) {
        console.log(`   - Matches found: ${data.matches.length}`);
      }
      if (data.reportUrl) {
        console.log(`   - Report URL: ${data.reportUrl}`);
      }
    } else {
      console.log('❌ Forensics endpoint failed');
    }
  } catch (error) {
    console.error('Error testing forensics endpoint:', error);
  }
}

async function main() {
  console.log('🔍 Watermark Detection API Integration Tests');
  console.log('='.repeat(50));
  console.log(`API Base: ${API_BASE}`);
  console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
  
  try {
    await testDetectEndpoint();
    await testForensicsEndpoint();
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests completed');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
