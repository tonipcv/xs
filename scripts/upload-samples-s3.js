#!/usr/bin/env node
/* eslint-disable no-console */
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

function getenv(name, fallback = undefined) {
  return process.env[name] ?? fallback;
}

const bucket = getenv("TEST_S3_BUCKET") || getenv("BUCKET_NAME");
const prefix = getenv("TEST_S3_PREFIX", "tests/prefetch");
const region = getenv("AWS_REGION", "us-east-1");
const endpoint = getenv("S3_ENDPOINT");
const forcePathStyle = getenv("S3_FORCE_PATH_STYLE") === "true";

if (!bucket) {
  console.error("Missing TEST_S3_BUCKET or BUCKET_NAME");
  process.exit(1);
}

const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle,
});

function makeWavBuffer({ seconds = 2, sampleRate = 16000 } = {}) {
  const samples = seconds * sampleRate;
  const header = Buffer.alloc(44);
  const data = Buffer.alloc(samples * 2);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t);
    const v = Math.max(-1, Math.min(1, sample));
    data.writeInt16LE(Math.floor(v * 32767), i * 2);
  }

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

async function putObject(key, body, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}/${key}`,
      Body: body,
      ContentType: contentType,
    })
  );
  console.log(`Uploaded s3://${bucket}/${prefix}/${key}`);
}

async function main() {
  const audio = makeWavBuffer({ seconds: 3 });
  const fhir = JSON.stringify(
    {
      resourceType: "DocumentReference",
      text: {
        div: "Patient John Doe, SSN 123-45-6789, phone 555-1234",
      },
      note: "Contact at john.doe@example.com",
    },
    null,
    2
  );
  const txt = "Sample text file for prefetch test.";

  await putObject("audio_sample.wav", audio, "audio/wav");
  await putObject("fhir_sample.json", Buffer.from(fhir), "application/fhir+json");
  await putObject("prefetch_sample.txt", Buffer.from(txt), "text/plain");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

