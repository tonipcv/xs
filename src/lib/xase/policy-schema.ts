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
  required: ["version", "policy_id", "dataset", "principals", "purposes", "rules"],
  properties: {
    version: { type: "string", enum: ["0.1"] },
    policy_id: { type: "string", minLength: 3 },
    name: { type: "string" },
    description: { type: "string" },

    dataset: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", minLength: 1 },
        columns: {
          type: "array",
          items: { type: "string", minLength: 1 },
          description: "Catálogo de colunas conhecidas (opcional, para validação)"
        }
      },
      additionalProperties: false
    },

    principals: {
      type: "object",
      description: "Grupos de atores/autorizados (tenants, roles, api-keys)",
      properties: {
        allow: { type: "array", items: { type: "string" } },
        deny: { type: "array", items: { type: "string" } }
      },
      additionalProperties: false
    },

    purposes: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 }
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
