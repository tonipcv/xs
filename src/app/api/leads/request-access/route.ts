import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      email,
      company,
      role,
      phone,
      estimatedVolume,
      dataType,
      useCase,
      message,
    } = body;

    // Validate required fields
    if (!name || !email || !company || !dataType || !estimatedVolume || !useCase) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Store lead in database (you can create a Lead model in Prisma)
    // For now, we'll log it and send email notification
    console.log('[Lead] New request access:', {
      name,
      email,
      company,
      role,
      dataType,
      estimatedVolume,
      useCase,
      timestamp: new Date().toISOString(),
    });

    // TODO: Send email notification to sales team
    // TODO: Add to CRM (HubSpot, Salesforce, etc.)
    // TODO: Store in database for tracking

    // For now, we'll create a simple audit log entry
    try {
      await prisma.$executeRaw`
        INSERT INTO audit_logs (event_type, actor_id, resource_type, resource_id, metadata, created_at)
        VALUES (
          'LEAD_REQUEST_ACCESS',
          ${email},
          'LEAD',
          ${email},
          ${JSON.stringify({
            name,
            email,
            company,
            role,
            phone,
            estimatedVolume,
            dataType,
            useCase,
            message,
          })}::jsonb,
          NOW()
        )
        ON CONFLICT DO NOTHING
      `;
    } catch (dbError) {
      // If audit log fails, continue anyway (non-critical)
      console.error('[Lead] Failed to store in audit log:', dbError);
    }

    // Send success response
    return NextResponse.json({
      success: true,
      message: 'Request submitted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Lead] Error processing request:', error);
    return NextResponse.json(
      {
        error: 'Failed to process request',
        debug: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
