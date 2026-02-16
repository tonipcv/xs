/**
 * XASE - Policy as Code (YAML) Schema (v0)
 * JSON Schema para validar documentos de política carregados via YAML
 *
 * Suporta:
 * - allow/deny por coluna
 * - máscaras por coluna (redact/hash/null/regex)
 * - filtros de linha (expressões simples por campo)
 * - propósitos de uso (purpose)
 * - janelas de validade (not_before/not_after)
 * - consent binding (status/versão/prova)
 */

export const XASE_POLICY_SCHEMA_V0 = {
  $id: "https://xase.dev/schemas/policy/v0.json",
  type: "object",
  required: ["apiVersion", "kind", "metadata", "spec"],
  properties: {
    apiVersion: { type: "string", enum: ["xase.ai/v1"] },
    kind: { type: "string", enum: ["DataAccessPolicy"] },
    metadata: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1 },
        description: { type: "string" }
      }
    },
    spec: {
      type: "object",
      required: ["dataset", "purpose"],
      additionalProperties: true,
      properties: {
        dataset: { 
          oneOf: [
            { type: "string", minLength: 1 },
            {
              type: "object",
              required: ["id"],
              properties: {
                id: { type: "string", minLength: 1 },
                columns: {
                  type: "array",
                  items: { type: "string", minLength: 1 }
                }
              }
            }
          ]
        },
        purpose: { 
          oneOf: [
            { 
              type: "string",
              enum: ["TRAINING", "ANALYTICS", "RESEARCH", "TESTING", "PRODUCTION", "DEVELOPMENT", "INFERENCE", "MARKETING", "OPERATIONS"]
            },
            { 
              type: "array",
              minItems: 1,
              items: { 
                type: "string",
                enum: ["TRAINING", "ANALYTICS", "RESEARCH", "TESTING", "PRODUCTION", "DEVELOPMENT", "INFERENCE", "MARKETING", "OPERATIONS"]
              }
            }
          ]
        },
        principals: {
          type: "object",
          properties: {
            allow: { type: "array", items: { type: "string" } },
            deny: { type: "array", items: { type: "string" } }
          }
        },
        columns: {
          type: "object",
          not: {
            required: ["allow", "deny"]
          },
          properties: {
            allow: { type: "array", items: { type: "string" } },
            deny: { type: "array", items: { type: "string" } },
            masking: {
              type: "array",
              items: {
                type: "object",
                required: ["column", "method"],
                properties: {
                  column: { type: "string" },
                  method: { 
                    oneOf: [
                      { type: "string", enum: ["redact", "hash", "null", "regex"] },
                      { type: "null" }
                    ]
                  },
                  regex: { type: "string" },
                  pattern: { type: "string" },
                  replace: { type: "string" },
                  replacement: { type: "string" }
                },
                allOf: [
                  {
                    if: {
                      properties: { method: { const: "regex" } }
                    },
                    then: {
                      required: ["pattern", "replacement"]
                    }
                  }
                ]
              }
            },
            mask: {
              type: "array",
              items: {
                type: "object",
                required: ["column", "method"],
                properties: {
                  column: { type: "string" },
                  method: { 
                    oneOf: [
                      { type: "string", enum: ["redact", "hash", "null", "regex"] },
                      { type: "null" }
                    ]
                  },
                  regex: { type: "string" },
                  pattern: { type: "string" },
                  replace: { type: "string" },
                  replacement: { type: "string" }
                },
                allOf: [
                  {
                    if: {
                      properties: { method: { const: "regex" } }
                    },
                    then: {
                      required: ["pattern", "replacement"]
                    }
                  }
                ]
              }
            }
          }
        },
        rows: {
          oneOf: [
            {
              type: "array",
              items: {
                type: "object",
                required: ["column", "operator", "value"],
                properties: {
                  column: { type: "string" },
                  operator: { 
                    type: "string",
                    enum: ["equals", "not_equals", "greater_than", "less_than", "in", "not_in", "contains", "starts_with", "ends_with"]
                  },
                  value: {}
                }
              }
            },
            {
              type: "object",
              properties: {
                allow: { type: "array" },
                deny: { type: "array" }
              }
            }
          ]
        },
        consent: {
          type: "object",
          properties: {
            required: { type: "boolean" },
            status: { type: "string" },
            min_version: { type: "string" },
            proof_required: { type: "boolean" },
            purposes: { 
              type: "array",
              items: { type: "string" }
            }
          }
        },
        validity: {
          type: "object",
          properties: {
            not_before: { type: "string", format: "date-time" },
            not_after: { type: "string", format: "date-time" },
            environments: {
              type: "array",
              items: { type: "string", enum: ["production", "staging", "development"] }
            }
          }
        }
      }
    },
    
    // Legacy format support
    version: { type: "string" },
    policy_id: { type: "string" },
    dataset: { type: "object" },
    principals: { type: "object" },
    purposes: { type: "array" },

    validity: {
      type: "object",
      properties: {
        not_before: { type: "string", format: "date-time" },
        not_after: { type: "string", format: "date-time" },
        environments: {
          type: "array",
          items: { type: "string", enum: ["production", "staging", "development"] }
        }
      },
      additionalProperties: false
    },

    consent: {
      type: "object",
      properties: {
        required: { type: "boolean", default: true },
        status: { type: "string", enum: ["VERIFIED_BY_XASE", "SELF_DECLARED", "PENDING"], default: "VERIFIED_BY_XASE" },
        min_version: { type: "string" },
        proof_required: { type: "boolean", default: false }
      },
      additionalProperties: false
    },

    rules: {
      type: "object",
      required: ["columns", "rows"],
      properties: {
        columns: {
          type: "object",
          properties: {
            allow: { type: "array", items: { type: "string" } },
            deny: { type: "array", items: { type: "string" } },
            masking: {
              type: "array",
              items: {
                type: "object",
                required: ["column", "method"],
                properties: {
                  column: { type: "string" },
                  method: { type: "string", enum: ["redact", "hash", "null", "regex"] },
                  regex: { type: "string" },
                  replace: { type: "string" },
                  except_principals: { type: "array", items: { type: "string" } }
                },
                additionalProperties: false
              }
            }
          },
          additionalProperties: false
        },
        rows: {
          type: "object",
          properties: {
            allow: {
              type: "array",
              items: {
                type: "object",
                required: ["field", "op", "value"],
                properties: {
                  field: { type: "string" },
                  op: { type: "string", enum: ["=", "!=", ">", ">=", "<", "<=", "in", "not_in"] },
                  value: {}
                },
                additionalProperties: false
              }
            },
            deny: {
              type: "array",
              items: {
                type: "object",
                required: ["field", "op", "value"],
                properties: {
                  field: { type: "string" },
                  op: { type: "string", enum: ["=", "!=", ">", ">=", "<", "<=", "in", "not_in"] },
                  value: {}
                },
                additionalProperties: false
              }
            }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
} as const;

export type ColumnMask = {
  column: string
  method: 'redact' | 'hash' | 'null' | 'regex'
  regex?: string
  replace?: string
  except_principals?: string[]
}

export type RowPredicate = {
  field: string
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not_in'
  value: any
}

export type PolicyRewritePlan = {
  datasetId: string
  allowedColumns: string[]
  deniedColumns: string[]
  masks: ColumnMask[]
  allowRowFilters: RowPredicate[]
  denyRowFilters: RowPredicate[]
  requiresConsent: boolean
  requiredConsentStatus?: 'VERIFIED_BY_XASE' | 'SELF_DECLARED' | 'PENDING'
  minConsentVersion?: string
  environments?: Array<'production' | 'staging' | 'development'>
  notBefore?: string
  notAfter?: string
}

export type XasePolicy = {
  version: "0.1";
  policy_id: string;
  name?: string;
  description?: string;
  dataset: { id: string; columns?: string[] };
  principals: { allow?: string[]; deny?: string[] };
  purposes: string[];
  validity?: { not_before?: string; not_after?: string; environments?: ("production"|"staging"|"development")[] };
  consent?: { required?: boolean; status?: "VERIFIED_BY_XASE"|"SELF_DECLARED"|"PENDING"; min_version?: string; proof_required?: boolean };
  rules: {
    columns: {
      allow?: string[];
      deny?: string[];
      masking?: { column: string; method: "redact"|"hash"|"null"|"regex"; regex?: string; replace?: string; except_principals?: string[] }[]
    };
    rows: {
      allow?: { field: string; op: string; value: any }[];
      deny?: { field: string; op: string; value: any }[];
    };
  };
};
