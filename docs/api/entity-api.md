# Entity Resolution API

## Overview

The Entity Resolution API provides deterministic tokenization and matching for patient/entity linking while preserving privacy.

## Endpoints

### Tokenize Entity

Generate deterministic tokens for entity identifiers.

**Endpoint**: `POST /api/v1/entity/tokenize`

**Authentication**: Required (API Key)

**Request Body** (Single):
```json
{
  "identifiers": {
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1990-01-01",
    "ssn": "123-45-6789",
    "email": "john@example.com",
    "phone": "+1-555-123-4567",
    "medicalRecordNumber": "MRN123456"
  },
  "returnSummaryOnly": false
}
```

**Request Body** (Batch):
```json
{
  "entities": [
    {
      "firstName": "John",
      "lastName": "Doe",
      "ssn": "123-45-6789"
    },
    {
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@example.com"
    }
  ],
  "returnSummaryOnly": false
}
```

**Response** (Single):
```json
{
  "result": {
    "entityToken": "a1b2c3d4e5f6...",
    "identifierTokens": {
      "ssn": "token_ssn_abc123...",
      "email": "token_email_def456...",
      "namedob": "token_namedob_ghi789..."
    },
    "confidence": "HIGH",
    "matchingStrategy": "ssn,email,namedob"
  },
  "validation": {
    "warnings": []
  }
}
```

**Response** (Batch):
```json
{
  "results": [
    {
      "entityToken": "a1b2c3d4e5f6...",
      "identifierTokens": { ... },
      "confidence": "HIGH",
      "matchingStrategy": "ssn"
    },
    {
      "entityToken": "x9y8z7w6v5u4...",
      "identifierTokens": { ... },
      "confidence": "LOW",
      "matchingStrategy": "email"
    }
  ],
  "count": 2
}
```

**Confidence Levels**:
- `HIGH`: SSN or Medical Record Number present
- `MEDIUM`: Name + DOB + (Email or Phone)
- `LOW`: Other combinations

---

### Deduplicate Entities

Identify duplicate entities based on tokens.

**Endpoint**: `POST /api/v1/entity/deduplicate`

**Authentication**: Required (API Key)

**Request Body**:
```json
{
  "entities": [
    {
      "id": "record_1",
      "identifiers": {
        "firstName": "John",
        "lastName": "Doe",
        "ssn": "123-45-6789"
      }
    },
    {
      "id": "record_2",
      "identifiers": {
        "firstName": "John",
        "lastName": "Doe",
        "ssn": "123-45-6789"
      }
    },
    {
      "id": "record_3",
      "identifiers": {
        "firstName": "Jane",
        "lastName": "Smith",
        "ssn": "987-65-4321"
      }
    }
  ]
}
```

**Response**:
```json
{
  "duplicates": [
    {
      "primaryId": "record_1",
      "duplicateIds": ["record_2"],
      "entityToken": "a1b2c3d4e5f6...",
      "confidence": "HIGH"
    }
  ],
  "totalEntities": 3,
  "duplicateGroups": 1,
  "uniqueEntities": 2
}
```

## Supported Identifiers

| Identifier | Type | Format | Required |
|------------|------|--------|----------|
| firstName | string | Any | No |
| lastName | string | Any | No |
| dateOfBirth | string | YYYY-MM-DD | No |
| ssn | string | 9 digits | No |
| email | string | Valid email | No |
| phone | string | E.164 format | No |
| medicalRecordNumber | string | Any | No |
| customId | string | Any | No |

**Note**: At least one identifier must be provided.

## Validation

The API validates identifiers before tokenization:

**Validation Rules**:
- SSN must be 9 digits
- Email must be valid format
- Phone must be 10-15 digits
- At least one identifier required

**Validation Warnings**:
- Low confidence identifiers
- Missing high-confidence fields

## Privacy & Security

### Deterministic Tokenization

- Same identifiers always produce same tokens
- Tokens are one-way (cannot reverse to original data)
- Uses HMAC-SHA256 with secret key
- Normalization ensures consistency

### Data Protection

- Original identifiers never stored
- Only tokens persisted in database
- Tokens enable linking without exposing PII
- Audit trail for all operations

### Compliance

- HIPAA compliant tokenization
- GDPR privacy-by-design
- Supports right to be forgotten (delete tokens)
- Audit logs for all entity operations

## Use Cases

### 1. Patient Matching

Link patient records across systems:
```json
{
  "identifiers": {
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1990-01-01",
    "medicalRecordNumber": "MRN123456"
  }
}
```

### 2. Deduplication

Find duplicate patient records:
```json
{
  "entities": [
    { "id": "r1", "identifiers": { "ssn": "123-45-6789" } },
    { "id": "r2", "identifiers": { "ssn": "123-45-6789" } }
  ]
}
```

### 3. Privacy-Preserving Analytics

Analyze data without exposing PII:
```json
{
  "identifiers": {
    "email": "patient@example.com"
  },
  "returnSummaryOnly": true
}
```

## Rate Limiting

- **Free tier**: 100 tokenizations/hour
- **Professional**: 1,000 tokenizations/hour
- **Enterprise**: 10,000+ tokenizations/hour

## Best Practices

1. **Use High-Confidence Identifiers**: Prefer SSN or MRN when available
2. **Normalize Before Sending**: Clean data before tokenization
3. **Batch Operations**: Use batch endpoint for multiple entities
4. **Handle Errors Gracefully**: Check validation warnings
5. **Audit Operations**: Enable audit logging for compliance
6. **Secure API Keys**: Never expose API keys in client-side code
7. **Test with Synthetic Data**: Use fake data for testing

## Error Handling

```json
{
  "error": "Invalid identifiers",
  "errors": [
    "SSN must be 9 digits",
    "Invalid email format"
  ],
  "warnings": [
    "Low confidence identifiers - consider adding SSN or MRN"
  ]
}
```

## Performance

- Single tokenization: < 10ms
- Batch tokenization (100 entities): < 100ms
- Deduplication (1000 entities): < 500ms

## Audit Trail

All operations are logged:
- Timestamp
- Tenant ID
- Operation type (TOKENIZE, DEDUPLICATE)
- Entity count
- Match count
- Success/failure status
