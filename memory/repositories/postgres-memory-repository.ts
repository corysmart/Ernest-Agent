import type { Pool } from 'pg';
import type { MemoryItem, MemoryType } from '../types';
import type { MemoryRepository } from './memory-repository';

export class PostgresMemoryRepository implements MemoryRepository {
  constructor(private readonly pool: Pool) {}

  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        last_accessed_at BIGINT,
        metadata JSONB,
        event_type TEXT,
        fact_confidence DOUBLE PRECISION,
        plan_summary TEXT,
        success_rate DOUBLE PRECISION
      );
    `);
  }

  async save(memory: MemoryItem): Promise<void> {
    const payload = {
      id: memory.id,
      type: memory.type,
      content: memory.content,
      created_at: memory.createdAt,
      last_accessed_at: memory.lastAccessedAt ?? null,
      metadata: memory.metadata ?? null,
      event_type: memory.type === 'episodic' ? memory.eventType : null,
      fact_confidence: memory.type === 'semantic' ? memory.factConfidence : null,
      plan_summary: memory.type === 'procedural' ? memory.planSummary : null,
      success_rate: memory.type === 'procedural' ? memory.successRate : null
    };

    await this.pool.query(
      `
      INSERT INTO memories (id, type, content, created_at, last_accessed_at, metadata, event_type, fact_confidence, plan_summary, success_rate)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        content = EXCLUDED.content,
        created_at = EXCLUDED.created_at,
        last_accessed_at = EXCLUDED.last_accessed_at,
        metadata = EXCLUDED.metadata,
        event_type = EXCLUDED.event_type,
        fact_confidence = EXCLUDED.fact_confidence,
        plan_summary = EXCLUDED.plan_summary,
        success_rate = EXCLUDED.success_rate
      `,
      [
        payload.id,
        payload.type,
        payload.content,
        payload.created_at,
        payload.last_accessed_at,
        payload.metadata ? JSON.stringify(payload.metadata) : null,
        payload.event_type,
        payload.fact_confidence,
        payload.plan_summary,
        payload.success_rate
      ]
    );
  }

  async getByIds(ids: string[]): Promise<MemoryItem[]> {
    if (!ids.length) {
      return [];
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await this.pool.query(
      `SELECT * FROM memories WHERE id IN (${placeholders})`,
      ids
    );

    return result.rows.map(toMemoryItem);
  }

  async updateAccess(id: string, accessedAt: number): Promise<void> {
    await this.pool.query(
      `UPDATE memories SET last_accessed_at = $1 WHERE id = $2`,
      [accessedAt, id]
    );
  }

  async listByType(types?: MemoryType[], limit: number = 50): Promise<MemoryItem[]> {
    const query = types && types.length
      ? {
        text: `SELECT * FROM memories WHERE type = ANY($1) ORDER BY created_at DESC LIMIT $2`,
        values: [types, limit]
      }
      : {
        text: `SELECT * FROM memories ORDER BY created_at DESC LIMIT $1`,
        values: [limit]
      };

    const result = await this.pool.query(query.text, query.values);
    return result.rows.map(toMemoryItem);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM memories WHERE id = $1`, [id]);
  }
}

interface MemoryRow {
  id: string;
  type: string;
  content: string;
  created_at: number | string;
  last_accessed_at?: number | string | null;
  metadata?: Record<string, unknown> | null;
  event_type?: string | null;
  fact_confidence?: number | string | null;
  plan_summary?: string | null;
  success_rate?: number | string | null;
}

function toMemoryItem(row: MemoryRow): MemoryItem {
  switch (row.type) {
    case 'episodic':
      return {
        id: row.id,
        type: 'episodic',
        content: row.content,
        createdAt: Number(row.created_at),
        lastAccessedAt: row.last_accessed_at ? Number(row.last_accessed_at) : undefined,
        metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) as Record<string, unknown> : undefined,
        eventType: row.event_type ?? 'event'
      };
    case 'semantic':
      return {
        id: row.id,
        type: 'semantic',
        content: row.content,
        createdAt: Number(row.created_at),
        lastAccessedAt: row.last_accessed_at ? Number(row.last_accessed_at) : undefined,
        metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) as Record<string, unknown> : undefined,
        factConfidence: Number(row.fact_confidence ?? 0)
      };
    case 'procedural':
      return {
        id: row.id,
        type: 'procedural',
        content: row.content,
        createdAt: Number(row.created_at),
        lastAccessedAt: row.last_accessed_at ? Number(row.last_accessed_at) : undefined,
        metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) as Record<string, unknown> : undefined,
        planSummary: row.plan_summary ?? '',
        successRate: Number(row.success_rate ?? 0)
      };
    default:
      throw new Error('Unknown memory type');
  }
}
