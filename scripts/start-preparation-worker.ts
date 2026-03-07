#!/usr/bin/env tsx
/**
 * Worker startup script for Data Preparation Pipeline
 * Run with: npx tsx scripts/start-preparation-worker.ts
 */

import { createWorker } from '../src/lib/preparation/worker';
import * as process from 'process';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log('[Worker] Starting Preparation Worker...');
console.log(`[Worker] Redis URL: ${REDIS_URL}`);

const worker = createWorker(REDIS_URL);

async function start() {
  try {
    await worker.start();
    console.log('[Worker] Started successfully');
    console.log('[Worker] Waiting for jobs...');
  } catch (error) {
    console.error('[Worker] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n[Worker] Received ${signal}. Shutting down...`);
  try {
    await worker.stop();
    console.log('[Worker] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Worker] Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
