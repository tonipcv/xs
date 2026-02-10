# Cloud Integration Browse API

## Overview

The Cloud Integration Browse API allows users to visually navigate and browse assets (buckets, folders, files, databases, tables) across different cloud storage and data warehouse providers.

## Supported Providers

- **AWS S3** - Browse buckets, folders, and objects
- **Google Cloud Storage (GCS)** - Browse buckets, folders, and files
- **Azure Blob Storage** - Browse containers, folders, and blobs
- **Snowflake** - Browse databases, schemas, and tables
- **BigQuery** - Browse projects, datasets, and tables

---

## API Endpoint

```
GET /api/cloud-integrations/[id]/browse?path={path}
```

### Parameters

- `id` (path parameter) - The cloud integration ID
- `path` (query parameter, optional) - The path to browse within the provider

### Response Format

```json
{
  "assets": [
    {
      "name": "bucket-name",
      "path": "bucket-name",
      "fullPath": "s3://bucket-name/",
      "type": "folder",
      "size": 1024000,
      "lastModified": "2025-02-06T10:00:00Z"
    }
  ]
}
```

---

## Provider-Specific Behavior

### AWS S3

**Credential Format:**
```json
{
  "accessKeyId": "AKIA...",
  "secretAccessKey": "..."
}
```

**Path Structure:**
- Root (`path=""`) → Lists all buckets
- Bucket (`path="my-bucket"`) → Lists folders/files in bucket root
- Folder (`path="my-bucket/folder"`) → Lists contents of folder

**Example Paths:**
- `""` → Lists buckets
- `"audio-prod"` → Lists root of audio-prod bucket
- `"audio-prod/recordings/2024"` → Lists files in recordings/2024 folder

**Full Path Format:** `s3://bucket-name/path/to/file.wav`

---

### Google Cloud Storage (GCS)

**Credential Format:**
```json
{
  "type": "service_account",
  "project_id": "my-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "service@project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

**Path Structure:**
- Root (`path=""`) → Lists all buckets
- Bucket (`path="my-bucket"`) → Lists folders/files in bucket root
- Folder (`path="my-bucket/folder"`) → Lists contents of folder

**Example Paths:**
- `""` → Lists buckets
- `"voice-data-prod"` → Lists root of voice-data-prod bucket
- `"voice-data-prod/recordings/2025"` → Lists files in recordings/2025 folder

**Full Path Format:** `gs://bucket-name/path/to/file.wav`

---

### Azure Blob Storage

**Credential Format:**
```
AccountKey string (base64 encoded)
```

**Required Integration Fields:**
- `accountName` - Azure storage account name

**Path Structure:**
- Root (`path=""`) → Lists all containers
- Container (`path="my-container"`) → Lists folders/blobs in container root
- Folder (`path="my-container/folder"`) → Lists contents of folder

**Example Paths:**
- `""` → Lists containers
- `"audio-container"` → Lists root of audio-container
- `"audio-container/healthcare/calls"` → Lists files in healthcare/calls folder

**Full Path Format:** `https://account.blob.core.windows.net/container/path/to/file.mp3`

---

### Snowflake

**Credential Format:**
```json
{
  "password": "..."
}
```
Or plain password string.

**Required Integration Fields:**
- `accountName` - Snowflake account identifier
- `username` - Snowflake username (optional, defaults to accountName)
- `warehouse` - Warehouse name
- `database` - Default database
- `schema` - Default schema (optional, defaults to PUBLIC)

**Path Structure:**
- Root (`path=""`) → Lists all databases
- Database (`path="VOICE_DB"`) → Lists schemas in database
- Schema (`path="VOICE_DB/PUBLIC"`) → Lists tables in schema

**Example Paths:**
- `""` → Lists databases
- `"VOICE_DATA_DB"` → Lists schemas in VOICE_DATA_DB
- `"VOICE_DATA_DB/PUBLIC"` → Lists tables in PUBLIC schema

**Full Path Format:** `snowflake://DATABASE.SCHEMA.TABLE`

---

### BigQuery

**Credential Format:**
```json
{
  "type": "service_account",
  "project_id": "my-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "service@project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

**Required Integration Fields:**
- `projectId` - GCP project ID

**Path Structure:**
- Root (`path=""`) → Returns project
- Project (`path="my-project"`) → Lists datasets in project
- Dataset (`path="my-project/audio_dataset"`) → Lists tables in dataset

**Example Paths:**
- `""` → Returns project
- `"voice-data-project"` → Lists datasets in project
- `"voice-data-project/audio_dataset"` → Lists tables in audio_dataset

**Full Path Format:** `bigquery://project.dataset.table`

---

## Error Handling

### Common Error Responses

**401 Unauthorized**
```json
{
  "error": "Unauthorized"
}
```

**403 Forbidden**
```json
{
  "error": "Forbidden"
}
```

**404 Not Found**
```json
{
  "error": "Integration not found"
}
```

**400 Bad Request**
```json
{
  "error": "Integration is DISABLED. Please reconnect."
}
```

**401 Authentication Failed**
```json
{
  "error": "Authentication failed. Please reconnect your integration."
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to browse S3: Access Denied"
}
```

---

## Security & Validation

### Path Validation
- Paths cannot contain `..` (directory traversal)
- Paths cannot start with `/` (absolute paths)
- Paths are sanitized before processing

### Integration Status
- Only `ACTIVE` integrations can be browsed
- Expired or disabled integrations return 400 error

### Credential Validation
- Credentials must exist in `encryptedAccessToken` or `encryptedRefreshToken`
- Credentials are decrypted on-demand
- Invalid credentials trigger authentication error

### Tenant Isolation
- Users can only browse integrations in their tenant
- Cross-tenant access is blocked with 403 error

---

## Testing

### Manual Testing

**1. Test S3 Browse**
```bash
curl -X GET \
  'http://localhost:3000/api/cloud-integrations/[integration-id]/browse?path=' \
  -H 'Cookie: next-auth.session-token=...'
```

**2. Test GCS Browse**
```bash
curl -X GET \
  'http://localhost:3000/api/cloud-integrations/[integration-id]/browse?path=my-bucket' \
  -H 'Cookie: next-auth.session-token=...'
```

**3. Test Azure Browse**
```bash
curl -X GET \
  'http://localhost:3000/api/cloud-integrations/[integration-id]/browse?path=my-container/folder' \
  -H 'Cookie: next-auth.session-token=...'
```

**4. Test Snowflake Browse**
```bash
curl -X GET \
  'http://localhost:3000/api/cloud-integrations/[integration-id]/browse?path=VOICE_DB' \
  -H 'Cookie: next-auth.session-token=...'
```

**5. Test BigQuery Browse**
```bash
curl -X GET \
  'http://localhost:3000/api/cloud-integrations/[integration-id]/browse?path=my-project/audio_dataset' \
  -H 'Cookie: next-auth.session-token=...'
```

---

## Integration with UI

The browse API is consumed by the visual dataset browser at:
```
/xase/voice/datasets/browse?integrationId=[id]
```

**User Flow:**
1. User clicks "Browse Datasets" on integration card
2. Browser page loads and calls `/api/cloud-integrations/[id]/browse?path=`
3. User navigates folders by clicking on them
4. Each click updates path and fetches new assets
5. User selects final location (file or folder)
6. Browser redirects to dataset creation form with pre-filled `storageLocation`

---

## Performance Considerations

### Caching
- No caching implemented (real-time data)
- Consider adding Redis cache for frequently accessed paths
- Cache TTL: 5-10 minutes recommended

### Rate Limiting
- Provider SDKs have their own rate limits
- S3: 3,500 PUT/COPY/POST/DELETE or 5,500 GET/HEAD requests per second per prefix
- GCS: 5,000 writes and 50,000 reads per second per bucket
- Azure: 20,000 requests per second per storage account
- Snowflake: Depends on warehouse size
- BigQuery: 100 requests per second per user

### Pagination
- Current implementation returns all results
- For large directories (>1000 items), implement pagination
- Add `limit` and `continuationToken` query parameters

---

## Troubleshooting

### "Authentication failed" Error
- Check if credentials are correctly encrypted in database
- Verify OAuth tokens haven't expired
- Test credentials manually with provider CLI/SDK
- Re-authenticate integration

### "Integration is DISABLED" Error
- Check integration status in database
- Verify last test status and error
- Run connection test via `/api/cloud-integrations/[id]/test`

### Empty Results
- Verify path format is correct for provider
- Check if user has permissions to list resources
- Verify bucket/container/database exists
- Check provider-specific IAM/permissions

### Slow Response
- Large directories take longer to list
- Network latency to provider API
- Consider implementing pagination
- Add loading states in UI

---

## Future Enhancements

1. **Pagination** - Support for large directories
2. **Search** - Filter assets by name/type
3. **Metadata** - Show more file details (content-type, tags)
4. **Preview** - Preview file contents for supported types
5. **Caching** - Redis cache for frequently accessed paths
6. **Batch Operations** - Select multiple files at once
7. **Permissions** - Show user's access level per resource
8. **Cost Estimation** - Estimate storage/query costs
