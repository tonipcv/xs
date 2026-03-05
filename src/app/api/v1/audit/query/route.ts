import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '@/lib/xase/clickhouse-client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { 
      tenantId, 
      eventType, 
      startDate, 
      endDate, 
      limit = 100,
      offset = 0,
      userId,
      datasetId,
      action
    } = body;

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required' },
        { status: 400 }
      );
    }

    const clickhouse = getClickHouseClient();
    
    // Build query based on event type
    let query = '';
    const params: any = {
      tenant_id: tenantId,
      limit,
      offset
    };

    switch (eventType) {
      case 'audit':
        query = `
          SELECT 
            event_id,
            tenant_id,
            user_id,
            action,
            resource_type,
            resource_id,
            ip_address,
            user_agent,
            metadata,
            previous_hash,
            event_hash,
            timestamp
          FROM audit_events
          WHERE tenant_id = {tenant_id:String}
        `;
        break;

      case 'policy_decision':
        query = `
          SELECT 
            decision_id,
            tenant_id,
            user_id,
            policy_id,
            dataset_id,
            decision,
            reason,
            metadata,
            previous_hash,
            decision_hash,
            timestamp
          FROM policy_decisions
          WHERE tenant_id = {tenant_id:String}
        `;
        break;

      case 'data_access':
        query = `
          SELECT 
            access_id,
            tenant_id,
            user_id,
            dataset_id,
            lease_id,
            action,
            rows_accessed,
            bytes_transferred,
            ip_address,
            metadata,
            previous_hash,
            access_hash,
            timestamp
          FROM data_access_events
          WHERE tenant_id = {tenant_id:String}
        `;
        break;

      case 'consent':
        query = `
          SELECT 
            consent_id,
            tenant_id,
            user_id,
            dataset_id,
            consent_type,
            granted,
            purposes,
            metadata,
            previous_hash,
            consent_hash,
            timestamp
          FROM consent_events
          WHERE tenant_id = {tenant_id:String}
        `;
        break;

      default:
        // Query all audit events by default
        query = `
          SELECT 
            event_id,
            tenant_id,
            user_id,
            action,
            resource_type,
            resource_id,
            ip_address,
            metadata,
            timestamp
          FROM audit_events
          WHERE tenant_id = {tenant_id:String}
        `;
    }

    // Add optional filters
    if (startDate) {
      query += ` AND timestamp >= {start_date:DateTime}`;
      params.start_date = startDate;
    }

    if (endDate) {
      query += ` AND timestamp <= {end_date:DateTime}`;
      params.end_date = endDate;
    }

    if (userId) {
      query += ` AND user_id = {user_id:String}`;
      params.user_id = userId;
    }

    if (datasetId) {
      query += ` AND dataset_id = {dataset_id:String}`;
      params.dataset_id = datasetId;
    }

    if (action) {
      query += ` AND action = {action:String}`;
      params.action = action;
    }

    // Order and limit
    query += ` ORDER BY timestamp DESC LIMIT {limit:UInt32} OFFSET {offset:UInt32}`;

    // Execute query (stub implementation returns empty array)
    const events = await clickhouse.query(query, params);

    // Get total count
    let countQuery = '';
    switch (eventType) {
      case 'audit':
        countQuery = 'SELECT count() as total FROM audit_events WHERE tenant_id = {tenant_id:String}';
        break;
      case 'policy_decision':
        countQuery = 'SELECT count() as total FROM policy_decisions WHERE tenant_id = {tenant_id:String}';
        break;
      case 'data_access':
        countQuery = 'SELECT count() as total FROM data_access_events WHERE tenant_id = {tenant_id:String}';
        break;
      case 'consent':
        countQuery = 'SELECT count() as total FROM consent_events WHERE tenant_id = {tenant_id:String}';
        break;
      default:
        countQuery = 'SELECT count() as total FROM audit_events WHERE tenant_id = {tenant_id:String}';
    }

    if (startDate) {
      countQuery += ` AND timestamp >= {start_date:DateTime}`;
    }
    if (endDate) {
      countQuery += ` AND timestamp <= {end_date:DateTime}`;
    }
    if (userId) {
      countQuery += ` AND user_id = {user_id:String}`;
    }
    if (datasetId) {
      countQuery += ` AND dataset_id = {dataset_id:String}`;
    }
    if (action) {
      countQuery += ` AND action = {action:String}`;
    }

    const countData = await clickhouse.query(countQuery, params) as any[];
    const total = countData[0]?.total || 0;

    return NextResponse.json({
      events,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      },
      query: {
        tenantId,
        eventType,
        startDate,
        endDate,
        userId,
        datasetId,
        action
      }
    });

  } catch (error: any) {
    console.error('Audit query error:', error);
    return NextResponse.json(
      { error: 'Failed to query audit logs', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const eventType = searchParams.get('eventType') || 'audit';
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required' },
        { status: 400 }
      );
    }

    const clickhouse = getClickHouseClient();

    // Simple query for GET requests
    const query = `
      SELECT 
        event_id,
        tenant_id,
        user_id,
        action,
        resource_type,
        resource_id,
        timestamp
      FROM audit_events
      WHERE tenant_id = {tenant_id:String}
      ORDER BY timestamp DESC
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `;

    const events = await clickhouse.query(query, [tenantId, limit, offset]);

    return NextResponse.json({
      events,
      pagination: {
        limit,
        offset
      }
    });

  } catch (error: any) {
    console.error('Audit query error:', error);
    return NextResponse.json(
      { error: 'Failed to query audit logs', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    );
  }
}
