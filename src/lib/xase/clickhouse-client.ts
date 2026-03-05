// Stub for backward compatibility after Sprint 1 cleanup
// TODO: Implement proper ClickHouse client or remove if not needed

export class ClickHouseClient {
  async query(sql: string, params?: unknown[]) {
    console.warn('ClickHouse query stubbed:', sql);
    return [];
  }

  async insert(table: string, data: unknown[]) {
    console.warn('ClickHouse insert stubbed:', table);
    return { inserted: 0 };
  }
}

export const clickhouse = new ClickHouseClient();

export function getClickHouseClient() {
  return clickhouse;
}
