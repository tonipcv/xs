# MinIO Webhook Configuration

## Overview
Configure MinIO to send notifications to the Xase Voice API when files are uploaded, triggering automatic audio processing.

## Prerequisites
- MinIO server running
- Xase Voice API deployed and accessible
- `MINIO_WEBHOOK_SECRET` environment variable set

## Configuration Steps

### 1. Set Environment Variable
Add to your `.env` file:
```bash
MINIO_WEBHOOK_SECRET=your-secure-random-secret-here
```

Generate a secure secret:
```bash
openssl rand -hex 32
```

### 2. Configure MinIO Webhook

#### Using MinIO Client (mc)
```bash
# Add webhook target
mc admin config set myminio notify_webhook:xase \
  endpoint="https://your-domain.com/api/v1/webhooks/minio" \
  auth_token="your-secure-random-secret-here"

# Restart MinIO
mc admin service restart myminio

# Enable bucket notification
mc event add myminio/xase arn:minio:sqs::xase:webhook --event put
```

#### Using MinIO Console
1. Navigate to **Settings** → **Notifications**
2. Add new webhook:
   - **Endpoint**: `https://your-domain.com/api/v1/webhooks/minio`
   - **Auth Header**: `x-minio-webhook-secret: your-secure-random-secret-here`
3. Save configuration
4. Navigate to **Buckets** → **xase** → **Events**
5. Add event:
   - **Event Type**: `s3:ObjectCreated:Put`
   - **Prefix**: `datasets/`
   - **Target**: Select the webhook created above

### 3. Test Webhook

Upload a test file:
```bash
mc cp test-audio.wav myminio/xase/datasets/ds_test123/test-audio.wav
```

Check API logs for webhook processing:
```bash
# Should see:
# [Webhook][MinIO] Processing upload: datasets/ds_test123/test-audio.wav
# [AudioProcessor] Processing file...
# [Dataset] Updated: totalDurationHours, numRecordings, processingStatus
```

## Webhook Payload Format

MinIO sends notifications in this format:
```json
{
  "Records": [
    {
      "s3": {
        "bucket": {
          "name": "xase"
        },
        "object": {
          "key": "datasets/ds_abc123/audio-file.wav",
          "size": 1024000
        }
      }
    }
  ]
}
```

## API Endpoint Behavior

**Endpoint**: `POST /api/v1/webhooks/minio`

**Authentication**: 
- Header: `x-webhook-secret` or `x-minio-webhook-secret`
- Value must match `MINIO_WEBHOOK_SECRET` env var

**Processing Flow**:
1. Validate webhook secret
2. Extract `datasetId` from file key (`datasets/{datasetId}/...`)
3. Update dataset `processingStatus` to `PROCESSING`
4. Process audio file (MVP: extract metadata via HEAD request)
5. Create `AudioSegment` record
6. Update dataset: `totalDurationHours`, `numRecordings`, `processingStatus=COMPLETED`

**Response**:
```json
{
  "ok": true,
  "processed": 1
}
```

## Troubleshooting

### Webhook not triggering
- Check MinIO logs: `mc admin logs myminio`
- Verify endpoint is accessible from MinIO server
- Test endpoint manually:
  ```bash
  curl -X POST https://your-domain.com/api/v1/webhooks/minio \
    -H "x-minio-webhook-secret: your-secret" \
    -H "Content-Type: application/json" \
    -d '{"Records":[{"s3":{"object":{"key":"datasets/ds_test/file.wav","size":1000}}}]}'
  ```

### Processing fails
- Check dataset exists in database
- Verify storage is configured (`MINIO_SERVER_URL`, etc.)
- Check API logs for errors
- Verify file is accessible via presigned URL

### Dataset stuck in PROCESSING
- Check `processingError` field in database
- Manually reset: `UPDATE xase_voice_datasets SET processing_status = 'PENDING' WHERE dataset_id = 'ds_xxx'`
- Re-upload file to trigger webhook again

## Production Recommendations

1. **Use HTTPS**: Webhook endpoint must use HTTPS in production
2. **Rate Limiting**: MinIO can send many webhooks quickly; ensure API can handle load
3. **Idempotency**: Webhook may be called multiple times for same file; handle gracefully
4. **Monitoring**: Set up alerts for failed processing (`processingStatus=FAILED`)
5. **Retry Logic**: Consider implementing retry for transient failures

## Local Development

For local testing without MinIO webhook:
```bash
# Manually trigger processing via API
curl -X POST http://localhost:3000/api/v1/webhooks/minio \
  -H "x-webhook-secret: dev-secret" \
  -H "Content-Type: application/json" \
  -d '{"Records":[{"s3":{"object":{"key":"datasets/ds_yourDatasetId/test.wav","size":32000}}}]}'
```

Or use the test script:
```bash
DATABASE_URL="..." node scripts/test-mvp-flow.js
```
