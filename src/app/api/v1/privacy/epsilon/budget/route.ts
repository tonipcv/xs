import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { EpsilonBudgetTracker } from '@/lib/xase/epsilon-budget-tracker';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const datasetId = searchParams.get('datasetId');

    if (!tenantId || !datasetId) {
      return NextResponse.json(
        { error: 'tenantId and datasetId are required' },
        { status: 400 }
      );
    }

    const tracker = new EpsilonBudgetTracker();
    const budget = await tracker.getBudget(tenantId, datasetId);
    await tracker.close();

    return NextResponse.json({
      budget,
      warning: budget.remaining < budget.totalBudget * 0.2 
        ? 'Budget is running low (< 20% remaining)'
        : null,
    });

  } catch (error: any) {
    console.error('Error getting epsilon budget:', error);
    return NextResponse.json(
      { error: 'Failed to get budget', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { tenantId, datasetId, epsilon, userId, purpose, queryId } = body;

    if (!tenantId || !datasetId || epsilon === undefined) {
      return NextResponse.json(
        { error: 'tenantId, datasetId, and epsilon are required' },
        { status: 400 }
      );
    }

    const tracker = new EpsilonBudgetTracker();
    
    // Check if query can be executed
    const check = await tracker.canExecuteQuery(tenantId, datasetId, epsilon);
    
    if (!check.allowed) {
      await tracker.close();
      return NextResponse.json(
        { 
          error: 'Budget exceeded',
          reason: check.reason,
          remaining: check.remaining,
        },
        { status: 403 }
      );
    }

    // Consume budget
    const budget = await tracker.consumeBudget(
      tenantId,
      datasetId,
      epsilon,
      userId || session.user.email,
      purpose || 'query',
      queryId || `query-${Date.now()}`
    );

    await tracker.close();

    return NextResponse.json({
      success: true,
      budget,
      consumed: epsilon,
      remaining: budget.remaining,
    });

  } catch (error: any) {
    console.error('Error consuming epsilon budget:', error);
    return NextResponse.json(
      { error: 'Failed to consume budget', details: error.message },
      { status: 500 }
    );
  }
}
