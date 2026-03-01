/**
 * Search API
 * Full-text search across resources
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { 
  searchDatasets, 
  searchAuditLogs,
  globalSearch,
  getSearchSuggestions 
} from '@/lib/search/search-service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/search
 * Global search across all resources
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        tenantId: true,
      },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    const type = url.searchParams.get('type') || 'global';
    const limit = parseInt(url.searchParams.get('limit') || '10');

    if (type === 'suggestions') {
      const suggestions = await getSearchSuggestions(user.tenantId, query, limit);
      return NextResponse.json({ suggestions });
    }

    if (type === 'global') {
      const results = await globalSearch(user.tenantId, query, limit);
      return NextResponse.json({ results });
    }

    return NextResponse.json(
      { error: 'Invalid search type' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error performing search:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/search
 * Advanced search with filters
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        tenantId: true,
      },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { type = 'datasets', ...searchQuery } = body;

    let results;

    if (type === 'datasets') {
      results = await searchDatasets(user.tenantId, searchQuery);
    } else if (type === 'audit') {
      results = await searchAuditLogs(user.tenantId, searchQuery);
    } else {
      return NextResponse.json(
        { error: 'Invalid search type' },
        { status: 400 }
      );
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Error performing advanced search:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
