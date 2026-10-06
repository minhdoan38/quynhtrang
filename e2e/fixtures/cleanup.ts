import { assertTestSupabaseUrl } from './supabase.ts';

export interface CleanupRecord {
  table: string;
  id: string;
  column?: string;
}

export interface SupabaseLikeClient {
  from(table: string): {
    delete(): {
      eq(column: string, value: string): Promise<{ error: unknown }>;
    };
  };
}

export async function cleanupRecords(
  client: SupabaseLikeClient,
  supabaseUrl: string,
  records: CleanupRecord[],
): Promise<void> {
  assertTestSupabaseUrl(supabaseUrl);

  const reverseList = [...records].reverse();
  for (const record of reverseList) {
    if (!record.id || typeof record.id !== 'string' || record.id.trim() === '') {
      throw new Error(`Refusing cleanup with blank record ID for table "${record.table}"`);
    }
    const column = record.column ?? 'id';
    const { error } = await client.from(record.table).delete().eq(column, record.id);
    if (error) {
      console.warn(
        `[TestCleanup] Warning: Failed to delete ${record.table}.${column}=${record.id}:`,
        error,
      );
    }
  }
}

export class TestCleanupRegistry {
  private readonly records: CleanupRecord[] = [];
  private readonly supabaseUrl: string;

  constructor(supabaseUrl: string) {
    assertTestSupabaseUrl(supabaseUrl);
    this.supabaseUrl = supabaseUrl;
  }

  register(table: string, id: string, column = 'id'): void {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new Error(`Cannot register blank id for cleanup on table "${table}"`);
    }
    this.records.push({ table, id, column });
  }

  unregister(table: string, id: string): void {
    const idx = this.records.findIndex((r) => r.table === table && r.id === id);
    if (idx !== -1) {
      this.records.splice(idx, 1);
    }
  }

  getRecords(): CleanupRecord[] {
    return [...this.records];
  }

  async cleanup(client: SupabaseLikeClient): Promise<void> {
    await cleanupRecords(client, this.supabaseUrl, this.records);
    this.records.length = 0;
  }
}
