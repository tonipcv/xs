# Dataset Catalog API

## Overview

The Dataset Catalog API provides discovery and search capabilities for datasets in the XASE platform.

## Endpoints

### Search Datasets

Search and filter datasets with advanced criteria.

**Endpoint**: `GET /api/v1/catalog/search`

**Query Parameters**:
- `q` (string, optional): Text search query
- `language` (string[], optional): Filter by language codes
- `dataType` (string[], optional): Filter by data types
- `consentStatus` (string[], optional): Filter by consent status
- `jurisdiction` (string[], optional): Filter by jurisdiction
- `allowedPurposes` (string[], optional): Filter by allowed purposes
- `status` (string[], optional): Filter by dataset status
- `minDurationHours` (number, optional): Minimum duration in hours
- `maxDurationHours` (number, optional): Maximum duration in hours
- `minRecordings` (number, optional): Minimum number of recordings
- `maxRecordings` (number, optional): Maximum number of recordings
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 100)
- `sortBy` (string, optional): Sort field (createdAt, updatedAt, totalDurationHours, numRecordings, name)
- `sortOrder` (string, optional): Sort order (asc, desc)

**Response**:
```json
{
  "datasets": [
    {
      "id": "ds_123",
      "datasetId": "dataset_123",
      "name": "English Medical Conversations",
      "description": "High-quality medical conversation dataset",
      "language": "en-US",
      "primaryLanguage": "en-US",
      "dataType": "AUDIO",
      "totalDurationHours": 1000,
      "numRecordings": 10000,
      "totalSizeBytes": "1000000000",
      "consentStatus": "VERIFIED_BY_XASE",
      "allowedPurposes": ["research", "training"],
      "jurisdiction": "US",
      "status": "ACTIVE",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "tenant": {
        "id": "tenant_123",
        "name": "Medical Research Corp"
      },
      "_stats": {
        "avgSnr": 25.5,
        "avgSpeechRatio": 0.8,
        "avgNoiseLevel": "LOW"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  },
  "facets": {
    "languages": {
      "en-US": 50,
      "pt-BR": 30,
      "es-ES": 20
    },
    "dataTypes": {
      "AUDIO": 80,
      "TEXT": 20
    },
    "consentStatuses": {
      "VERIFIED_BY_XASE": 60,
      "SELF_DECLARED": 40
    },
    "jurisdictions": {
      "US": 50,
      "BR": 30,
      "ES": 20
    }
  }
}
```

**Rate Limits**: 100 requests/minute (free tier)

---

### Get Dataset Details

Get detailed information about a specific dataset.

**Endpoint**: `GET /api/v1/catalog/{datasetId}`

**Path Parameters**:
- `datasetId` (string, required): Dataset ID

**Response**:
```json
{
  "dataset": {
    "id": "ds_123",
    "datasetId": "dataset_123",
    "name": "English Medical Conversations",
    "description": "High-quality medical conversation dataset",
    "language": "en-US",
    "totalDurationHours": 1000,
    "numRecordings": 10000,
    "consentStatus": "VERIFIED_BY_XASE",
    "allowedPurposes": ["research", "training"],
    "status": "ACTIVE",
    "_stats": {
      "avgSnr": 25.5,
      "avgSpeechRatio": 0.8,
      "avgNoiseLevel": "LOW"
    }
  },
  "similar": [
    {
      "id": "ds_456",
      "name": "Similar Dataset",
      "language": "en-US",
      "totalDurationHours": 500
    }
  ]
}
```

---

### Get Catalog Statistics

Get aggregate statistics for the entire catalog.

**Endpoint**: `GET /api/v1/catalog/stats`

**Response**:
```json
{
  "totalDatasets": 100,
  "totalDurationHours": 10000,
  "totalRecordings": 100000,
  "totalSizeBytes": "10000000000",
  "byLanguage": {
    "en-US": 50,
    "pt-BR": 30,
    "es-ES": 20
  },
  "byDataType": {
    "AUDIO": 80,
    "TEXT": 20
  },
  "byConsentStatus": {
    "VERIFIED_BY_XASE": 60,
    "SELF_DECLARED": 40
  }
}
```

---

### Get Trending Datasets

Get most accessed datasets in the last 7 days.

**Endpoint**: `GET /api/v1/catalog/trending`

**Query Parameters**:
- `limit` (number, optional): Number of results (default: 10, max: 50)

**Response**:
```json
{
  "datasets": [
    {
      "id": "ds_123",
      "name": "Popular Dataset",
      "language": "en-US",
      "totalDurationHours": 1000,
      "numRecordings": 10000
    }
  ],
  "count": 10
}
```

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

**Status Codes**:
- `400`: Bad Request - Invalid parameters
- `401`: Unauthorized - Missing or invalid API key
- `403`: Forbidden - Insufficient permissions
- `404`: Not Found - Resource not found
- `429`: Too Many Requests - Rate limit exceeded
- `500`: Internal Server Error

## Rate Limiting

All endpoints include rate limit headers:
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Time when rate limit resets (ISO 8601)
- `Retry-After`: Seconds to wait before retrying (when rate limited)

## Authentication

Most endpoints support optional API key authentication:
```
X-API-Key: xase_your_api_key_here
```

Or Bearer token:
```
Authorization: Bearer xase_your_api_key_here
```
