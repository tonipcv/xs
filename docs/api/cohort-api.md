# Cohort Builder API

## Overview

The Cohort Builder API enables creation of complex data cohorts using advanced query criteria.

## Endpoints

### Build Cohort

Create a cohort based on criteria.

**Endpoint**: `POST /api/v1/cohorts/build`

**Authentication**: Required (API Key)

**Request Body**:
```json
{
  "name": "High Quality English Speakers",
  "description": "English speakers with high audio quality",
  "criteria": {
    "operator": "AND",
    "conditions": [
      {
        "field": "language",
        "operator": "equals",
        "value": "en-US",
        "dataType": "string"
      },
      {
        "operator": "AND",
        "conditions": [
          {
            "field": "snr",
            "operator": "greater_than",
            "value": 20,
            "dataType": "number"
          },
          {
            "field": "speechRatio",
            "operator": "greater_than",
            "value": 0.7,
            "dataType": "number"
          }
        ]
      }
    ]
  },
  "datasetId": "dataset_123"
}
```

**Criteria Operators**:
- `equals`: Exact match
- `not_equals`: Not equal
- `contains`: String contains (case-insensitive)
- `not_contains`: String does not contain
- `greater_than`: Numeric greater than
- `less_than`: Numeric less than
- `between`: Value between two numbers [min, max]
- `in`: Value in array
- `not_in`: Value not in array
- `is_null`: Field is null
- `is_not_null`: Field is not null

**Logical Operators**:
- `AND`: All conditions must be true
- `OR`: At least one condition must be true
- `NOT`: Negate conditions

**Response**:
```json
{
  "cohort": {
    "cohortId": "cohort_abc123",
    "name": "High Quality English Speakers",
    "description": "English speakers with high audio quality",
    "criteria": { ... },
    "matchCount": 5000,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  },
  "validation": {
    "warnings": []
  }
}
```

---

### Get Cohort Templates

Get pre-defined cohort templates.

**Endpoint**: `GET /api/v1/cohorts/templates`

**Response**:
```json
{
  "templates": {
    "ageRange": {
      "name": "Age Range",
      "description": "Filter by age range",
      "example": {
        "operator": "AND",
        "conditions": [
          {
            "field": "age",
            "operator": "between",
            "value": [18, 65],
            "dataType": "number"
          }
        ]
      }
    },
    "language": {
      "name": "Language Filter",
      "description": "Filter by language(s)",
      "example": {
        "operator": "AND",
        "conditions": [
          {
            "field": "language",
            "operator": "in",
            "value": ["en-US", "pt-BR"],
            "dataType": "array"
          }
        ]
      }
    },
    "qualityThreshold": {
      "name": "Quality Threshold",
      "description": "Filter by audio quality metrics",
      "example": {
        "operator": "AND",
        "conditions": [
          {
            "field": "snr",
            "operator": "greater_than",
            "value": 20,
            "dataType": "number"
          },
          {
            "field": "speechRatio",
            "operator": "greater_than",
            "value": 0.7,
            "dataType": "number"
          }
        ]
      }
    },
    "consentVerified": {
      "name": "Consent Verified",
      "description": "Only verified consent records",
      "example": {
        "operator": "AND",
        "conditions": [
          {
            "field": "consentStatus",
            "operator": "equals",
            "value": "VERIFIED_BY_XASE",
            "dataType": "string"
          }
        ]
      }
    }
  }
}
```

## Examples

### Simple Cohort

Filter by single criterion:
```json
{
  "name": "English Speakers",
  "criteria": {
    "operator": "AND",
    "conditions": [
      {
        "field": "language",
        "operator": "equals",
        "value": "en-US"
      }
    ]
  }
}
```

### Complex Nested Cohort

Multiple criteria with nesting:
```json
{
  "name": "High Quality Multi-Language",
  "criteria": {
    "operator": "AND",
    "conditions": [
      {
        "field": "language",
        "operator": "in",
        "value": ["en-US", "pt-BR", "es-ES"]
      },
      {
        "operator": "OR",
        "conditions": [
          {
            "field": "snr",
            "operator": "greater_than",
            "value": 25
          },
          {
            "field": "consentStatus",
            "operator": "equals",
            "value": "VERIFIED_BY_XASE"
          }
        ]
      }
    ]
  }
}
```

### Date Range Cohort

Filter by date range:
```json
{
  "name": "Recent Recordings",
  "criteria": {
    "operator": "AND",
    "conditions": [
      {
        "field": "createdAt",
        "operator": "between",
        "value": ["2024-01-01T00:00:00Z", "2024-12-31T23:59:59Z"],
        "dataType": "date"
      }
    ]
  }
}
```

## Validation

The API validates cohort definitions before execution:

**Validation Errors**:
- Missing required fields (name, criteria)
- Invalid operators
- Malformed criteria structure
- Empty conditions

**Validation Warnings**:
- Unknown field names
- Low confidence criteria
- Performance concerns

## Rate Limiting

- **Free tier**: 10 cohort builds/hour
- **Professional**: 100 cohort builds/hour
- **Enterprise**: Unlimited

## Best Practices

1. **Start Simple**: Begin with simple criteria and add complexity incrementally
2. **Use Templates**: Leverage pre-defined templates for common use cases
3. **Validate First**: Check validation warnings before executing large cohorts
4. **Limit Nesting**: Avoid deeply nested criteria (max 3 levels recommended)
5. **Test Small**: Test criteria on small datasets before scaling
