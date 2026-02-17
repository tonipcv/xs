import Ajv, { ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'
import { parse as parseYAML } from 'yaml'
import { XASE_POLICY_SCHEMA_V0, XasePolicy, PolicyRewritePlan, ColumnMask, RowPredicate } from './policy-schema'

export type PolicyValidationResult = {
  valid: boolean
  errors?: { message: string; path?: string }[]
  policy?: XasePolicy
  plan?: PolicyRewritePlan
}

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
ajv.addSchema(XASE_POLICY_SCHEMA_V0, 'https://xase.dev/schemas/policy/v0.json')
const validate = ajv.getSchema('https://xase.dev/schemas/policy/v0.json')!

export function validatePolicy(yamlContent: string): PolicyValidationResult {
  return parsePolicyYAML(yamlContent);
}

export function parseAndValidatePolicy(yamlContent: string): PolicyValidationResult {
  return parsePolicyYAML(yamlContent);
}

export function parsePolicyYAML(yamlContent: string): PolicyValidationResult {
  let doc: any
  try {
    doc = parseYAML(yamlContent)
  } catch (e: any) {
    return { valid: false, errors: [{ message: `YAML parse error: ${e.message}` }] }
  }

  const valid = validate(doc) as boolean
  if (!valid) {
    const errs = (validate.errors || []).map((e: ErrorObject) => ({
      message: e.message || 'schema error',
      path: (e as any).instancePath || (e as any).dataPath || undefined,
    }))
    return { valid: false, errors: errs }
  }

  const policy = doc as XasePolicy
  const plan: PolicyRewritePlan = buildRewritePlan(policy)
  return { valid: true, policy, plan }
}

export function buildRewritePlan(policy: any): PolicyRewritePlan {
  // Support both Kubernetes-style (spec.columns) and legacy format (rules.columns)
  const spec = policy.spec || policy
  const rules = spec.rules || spec
  const columns = spec.columns || rules?.columns || {}
  const rows = spec.rows || rules?.rows || {}
  
  const allowedColumns = columns.allow || []
  const deniedColumns = columns.deny || []
  const masks: ColumnMask[] = (columns.masking || []).map((m: any) => ({
    column: m.column,
    method: m.method,
    regex: m.regex,
    replace: m.replace,
  }))

  // Handle rows as array (direct filters) or object (allow/deny)
  let allowRowFilters: RowPredicate[] = []
  let denyRowFilters: RowPredicate[] = []
  
  if (Array.isArray(rows)) {
    // Direct array format - treat as allow filters
    allowRowFilters = rows as RowPredicate[]
  } else {
    allowRowFilters = (rows.allow || []) as RowPredicate[]
    denyRowFilters = (rows.deny || []) as RowPredicate[]
  }

  // Extract dataset ID from various formats
  let datasetId = ''
  if (typeof spec.dataset === 'string') {
    datasetId = spec.dataset
  } else if (spec.dataset?.id) {
    datasetId = spec.dataset.id
  } else if (policy.dataset?.id) {
    datasetId = policy.dataset.id
  }

  return {
    datasetId,
    allowedColumns,
    deniedColumns,
    masks,
    allowRowFilters,
    denyRowFilters,
    requiresConsent: spec.consent?.required ?? policy.consent?.required ?? true,
    requiredConsentStatus: spec.consent?.status || policy.consent?.status,
    minConsentVersion: spec.consent?.min_version || policy.consent?.min_version,
    environments: spec.validity?.environments || policy.validity?.environments,
    notBefore: spec.validity?.not_before || policy.validity?.not_before,
    notAfter: spec.validity?.not_after || policy.validity?.not_after,
  }
}

export function evaluateContextAgainstPolicy(
  policy: XasePolicy,
  opts: {
    principal: string
    purpose: string
    environment?: 'production'|'staging'|'development'
    now?: Date
    consent?: { status?: 'VERIFIED_BY_XASE'|'SELF_DECLARED'|'PENDING'; version?: string; hasProof?: boolean }
  }
): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = []

  if (policy.principals.deny?.includes(opts.principal)) {
    reasons.push('principal denied')
  }
  if (policy.principals.allow && !policy.principals.allow.includes(opts.principal)) {
    reasons.push('principal not in allow list')
  }

  if (!policy.purposes.includes(opts.purpose)) {
    reasons.push('purpose not allowed')
  }

  if (policy.validity?.environments && opts.environment && !policy.validity.environments.includes(opts.environment)) {
    reasons.push('environment not allowed')
  }

  const now = opts.now || new Date()
  if (policy.validity?.not_before && now < new Date(policy.validity.not_before)) {
    reasons.push('not_before not reached')
  }
  if (policy.validity?.not_after && now > new Date(policy.validity.not_after)) {
    reasons.push('not_after exceeded')
  }

  if (policy.consent?.required !== false) {
    const c = opts.consent || {}
    if (policy.consent?.status && c.status && policy.consent.status !== c.status) {
      reasons.push('consent status mismatch')
    }
    if (policy.consent?.min_version && c.version) {
      if (c.version < policy.consent.min_version) {
        reasons.push('consent version below minimum')
      }
    }
    if (policy.consent?.proof_required && !c.hasProof) {
      reasons.push('consent proof missing')
    }
  }

  return { allowed: reasons.length === 0, reasons }
}
