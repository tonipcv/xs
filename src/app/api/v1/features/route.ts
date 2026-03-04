/**
 * Feature Flags API
 */

import { NextRequest, NextResponse } from 'next/server'
import { FeatureManager } from '@/lib/features/feature-manager'
import { protectApiEndpoint } from '@/lib/security/api-protection'

export async function GET(request: NextRequest) {
  const protection = await protectApiEndpoint(request, {
    requireApiKey: true,
    requireTenant: true,
    endpoint: 'features',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const featureId = searchParams.get('feature')

    if (featureId) {
      // Check specific feature
      const evaluation = await FeatureManager.evaluate(featureId, {
        tenantId: protection.tenantId,
      })

      const response = NextResponse.json({
        feature: featureId,
        enabled: evaluation.enabled,
        reason: evaluation.reason,
      })

      if (protection.headers) {
        Object.entries(protection.headers).forEach(([key, value]) => {
          response.headers.set(key, value)
        })
      }

      return response
    }

    // Get all enabled features
    const enabledFeatures = await FeatureManager.getEnabledFeatures({
      tenantId: protection.tenantId,
    })

    const response = NextResponse.json({
      features: enabledFeatures,
      count: enabledFeatures.length,
    })

    if (protection.headers) {
      Object.entries(protection.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  } catch (error) {
    console.error('[API] Features error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch features' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const protection = await protectApiEndpoint(request, {
    requireApiKey: true,
    requireTenant: true,
    endpoint: 'features',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    const body = await request.json()
    const { featureId, action, value } = body

    if (!featureId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    switch (action) {
      case 'enable':
        FeatureManager.enableFeature(featureId)
        break
      case 'disable':
        FeatureManager.disableFeature(featureId)
        break
      case 'setRollout':
        if (typeof value !== 'number') {
          return NextResponse.json(
            { error: 'Rollout value must be a number' },
            { status: 400 }
          )
        }
        FeatureManager.setRollout(featureId, value)
        break
      case 'addTenant':
        FeatureManager.addTargetTenant(featureId, protection.tenantId!)
        break
      case 'removeTenant':
        FeatureManager.removeTargetTenant(featureId, protection.tenantId!)
        break
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
    }

    const response = NextResponse.json({
      success: true,
      feature: featureId,
      action,
    })

    if (protection.headers) {
      Object.entries(protection.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  } catch (error) {
    console.error('[API] Feature update error:', error)
    return NextResponse.json(
      { error: 'Failed to update feature' },
      { status: 500 }
    )
  }
}
