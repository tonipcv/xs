import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, hasPermission } from '@/lib/xase/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/xase/v1/model-cards
 * Lista model cards do tenant
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request)
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error, code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const modelId = searchParams.get('model_id')
    const isActive = searchParams.get('is_active')

    const whereClause: any = { tenantId: auth.tenantId! }
    if (modelId) whereClause.modelId = modelId
    if (isActive !== null) whereClause.isActive = isActive === 'true'

    const modelCards = await prisma.modelCard.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      model_cards: modelCards.map((mc) => ({
        id: mc.id,
        model_id: mc.modelId,
        model_version: mc.modelVersion,
        model_hash: mc.modelHash,
        model_name: mc.modelName,
        model_type: mc.modelType,
        framework: mc.framework,
        description: mc.description,
        training_date: mc.trainingDate,
        dataset_hash: mc.datasetHash,
        dataset_size: mc.datasetSize,
        performance_metrics: mc.performanceMetrics ? JSON.parse(mc.performanceMetrics) : null,
        fairness_metrics: mc.fairnessMetrics ? JSON.parse(mc.fairnessMetrics) : null,
        intended_use: mc.intendedUse,
        is_active: mc.isActive,
        deployed_at: mc.deployedAt,
        created_at: mc.createdAt,
      })),
    })
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown')
    console.error('[Model Cards API] GET Error:', message)
    return NextResponse.json({ error: 'MODEL_CARDS_ERROR', message }, { status: 500 })
  }
}

/**
 * POST /api/xase/v1/model-cards
 * Registra um novo model card
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request)
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error, code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (!hasPermission(auth, 'ingest')) {
      return NextResponse.json(
        { error: 'API key does not have ingest permission', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validações
    if (!body.model_id || !body.model_version) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'model_id and model_version are required' },
        { status: 400 }
      )
    }

    // Calcular model_hash se não fornecido
    let modelHash = body.model_hash
    if (!modelHash && body.model_artifacts) {
      const hash = crypto.createHash('sha256')
      hash.update(JSON.stringify(body.model_artifacts))
      modelHash = hash.digest('hex')
    }

    // Criar model card
    const modelCard = await prisma.modelCard.create({
      data: {
        tenantId: auth.tenantId!,
        modelId: body.model_id,
        modelVersion: body.model_version,
        modelHash: modelHash || 'unknown',
        modelName: body.model_name,
        modelType: body.model_type,
        framework: body.framework,
        description: body.description,
        trainingDate: body.training_date ? new Date(body.training_date) : null,
        datasetHash: body.dataset_hash,
        datasetSize: body.dataset_size,
        trainingDuration: body.training_duration_seconds,
        performanceMetrics: body.performance_metrics
          ? JSON.stringify(body.performance_metrics)
          : null,
        fairnessMetrics: body.fairness_metrics ? JSON.stringify(body.fairness_metrics) : null,
        validationMetrics: body.validation_metrics
          ? JSON.stringify(body.validation_metrics)
          : null,
        intendedUse: body.intended_use,
        limitations: body.limitations,
        ethicalConsiderations: body.ethical_considerations,
        featureSchemaHash: body.feature_schema_hash,
        featureSchema: body.feature_schema ? JSON.stringify(body.feature_schema) : null,
        featureImportance: body.feature_importance
          ? JSON.stringify(body.feature_importance)
          : null,
        isActive: body.is_active !== undefined ? body.is_active : true,
        deployedAt: body.deployed_at ? new Date(body.deployed_at) : new Date(),
      },
    })

    return NextResponse.json(
      {
        message: 'Model card created successfully',
        model_card: {
          id: modelCard.id,
          model_id: modelCard.modelId,
          model_version: modelCard.modelVersion,
          model_hash: modelCard.modelHash,
          created_at: modelCard.createdAt,
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown')
    console.error('[Model Cards API] POST Error:', message)
    
    // Erro de duplicação
    if (message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'DUPLICATE_MODEL_CARD', message: 'Model card already exists for this version' },
        { status: 409 }
      )
    }
    
    return NextResponse.json({ error: 'MODEL_CARD_CREATE_ERROR', message }, { status: 500 })
  }
}
