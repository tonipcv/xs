/**
 * POLICY ENFORCEMENT MIDDLEWARE
 * 
 * Middleware global que aplica PEP em rotas de dados.
 * Integra com policy engine existente.
 */

// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { PolicyEnforcementPoint } from '@/lib/xase/policy-enforcement-point'
import { parseAndValidatePolicy } from '@/lib/xase/policy-validator'
import { prisma } from '@/lib/prisma'

export interface PolicyEnforcementConfig {
  policyId: string
  tenantId: string
  principal: string
  purpose: string
  environment?: 'production' | 'staging' | 'development'
}

/**
 * Aplica enforcement de política em dados
 */
export async function enforcePolicyOnData(
  data: any,
  config: PolicyEnforcementConfig
): Promise<{ allowed: boolean; data?: any; reason?: string }> {
  try {
    // 1. Buscar política YAML do banco
    const policyRecord = await prisma.policy.findFirst({
      where: {
        policyId: config.policyId,
        tenantId: config.tenantId,
        isActive: true,
      },
      select: { document: true },
    })

    if (!policyRecord) {
      return { allowed: false, reason: 'Policy not found' }
    }

    // 2. Validar política YAML
    const policyYaml = typeof policyRecord.document === 'string' 
      ? policyRecord.document 
      : JSON.stringify(policyRecord.document)

    const validation = parseAndValidatePolicy(policyYaml)
    
    if (!validation.valid) {
      return { allowed: false, reason: 'Invalid policy' }
    }

    // 3. Avaliar contexto
    const evaluation = PolicyEnforcementPoint.evaluate(validation.policy!, {
      principal: config.principal,
      purpose: config.purpose,
      environment: config.environment,
    })

    if (!evaluation.allowed) {
      return { 
        allowed: false, 
        reason: evaluation.reasons.join(', ') 
      }
    }

    // 4. Aplicar enforcement
    const enforcedData = PolicyEnforcementPoint.enforce(
      data,
      evaluation.plan!,
      config.principal
    )

    return { allowed: true, data: enforcedData }
  } catch (error: any) {
    console.error('[PolicyEnforcement] Error:', error)
    return { allowed: false, reason: 'Internal error' }
  }
}

/**
 * Middleware para Next.js API routes
 */
export function withPolicyEnforcement(
  handler: (req: NextRequest, context: any) => Promise<NextResponse>,
  getPolicyConfig: (req: NextRequest) => Promise<PolicyEnforcementConfig | null>
) {
  return async (req: NextRequest, context: any) => {
    // Obter configuração de política
    const config = await getPolicyConfig(req)
    
    if (!config) {
      // Sem política configurada, passar adiante
      return handler(req, context)
    }

    // Executar handler original
    const response = await handler(req, context)

    // Se resposta é JSON, aplicar enforcement
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      try {
        const data = await response.json()
        
        const result = await enforcePolicyOnData(data, config)
        
        if (!result.allowed) {
          return NextResponse.json(
            { error: 'Access denied', reason: result.reason },
            { status: 403 }
          )
        }

        return NextResponse.json(result.data, {
          status: response.status,
          headers: response.headers,
        })
      } catch (error) {
        // Se não conseguir parsear JSON, retornar resposta original
        return response
      }
    }

    return response
  }
}

/**
 * Helper para extrair configuração de política de headers/query
 */
export async function extractPolicyConfig(req: NextRequest): Promise<PolicyEnforcementConfig | null> {
  const policyId = req.headers.get('x-policy-id') || req.nextUrl.searchParams.get('policyId')
  const tenantId = req.headers.get('x-tenant-id')
  const principal = req.headers.get('x-principal') || 'anonymous'
  const purpose = req.headers.get('x-purpose') || 'general'
  const environment = (req.headers.get('x-environment') || 'production') as 'production' | 'staging' | 'development'

  if (!policyId || !tenantId) {
    return null
  }

  return {
    policyId,
    tenantId,
    principal,
    purpose,
    environment,
  }
}
