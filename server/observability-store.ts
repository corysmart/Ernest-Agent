/**
 * Persistent ring buffers for runs and audit events.
 * Used by the observability UI when OBS_UI_ENABLED.
 * Data is stored in JSON files and survives server restarts.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

const DEFAULT_MAX_RUNS = 100;
const DEFAULT_MAX_EVENTS = 500;
const PERSIST_DEBOUNCE_MS = 500;

export interface RunEntry {
  requestId: string;
  tenantId?: string;
  timestamp: number;
  status: 'completed' | 'idle' | 'dry_run' | 'error';
  selectedGoalId?: string;
  error?: string;
  decision?: { actionType: string; actionPayload?: Record<string, unknown>; confidence?: number; reasoning?: string };
  actionResult?: { success?: boolean; error?: string; skipped?: boolean };
  stateTrace?: string[];
  observationSummary?: string[];
  dryRunMode?: 'with-llm' | 'without-llm';
  durationMs?: number;
}

export interface AuditEventEntry {
  timestamp: number;
  tenantId?: string;
  requestId?: string;
  eventType: string;
  data: Record<string, unknown>;
}

export interface ActiveRunEntry {
  requestId: string;
  tenantId?: string;
  startTime: number;
  currentState: string;
  stateTrace: string[];
}

type EventListener = (event: AuditEventEntry) => void;

function resolveDataDir(): string {
  const raw = process.env.OBS_UI_DATA_DIR ?? 'data/observability';
  const expanded = raw.replace(/^~/, homedir());
  return resolve(process.cwd(), expanded);
}

export class ObservabilityStore {
  private runs: RunEntry[] = [];
  private events: AuditEventEntry[] = [];
  private activeRuns: Map<string, ActiveRunEntry> = new Map();
  private readonly maxRuns: number;
  private readonly maxEvents: number;
  private eventListeners: Set<EventListener> = new Set();
  private readonly dataDir: string;
  private readonly runsPath: string;
  private readonly eventsPath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options?: { maxRuns?: number; maxEvents?: number; dataDir?: string }) {
    this.maxRuns = options?.maxRuns ?? (Number(process.env.OBS_UI_MAX_RUNS) || DEFAULT_MAX_RUNS);
    this.maxEvents = options?.maxEvents ?? (Number(process.env.OBS_UI_MAX_EVENTS) || DEFAULT_MAX_EVENTS);
    this.dataDir = options?.dataDir ?? resolveDataDir();
    this.runsPath = join(this.dataDir, 'runs.json');
    this.eventsPath = join(this.dataDir, 'events.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      mkdirSync(this.dataDir, { recursive: true });
      if (existsSync(this.runsPath)) {
        const raw = readFileSync(this.runsPath, 'utf-8');
        const parsed = JSON.parse(raw) as RunEntry[];
        if (Array.isArray(parsed)) {
          this.runs = parsed.slice(0, this.maxRuns);
        }
      }
      if (existsSync(this.eventsPath)) {
        const raw = readFileSync(this.eventsPath, 'utf-8');
        const parsed = JSON.parse(raw) as AuditEventEntry[];
        if (Array.isArray(parsed)) {
          this.events = parsed.slice(0, this.maxEvents);
        }
      }
    } catch (err) {
      console.warn('[WARNING] Failed to load observability data:', err instanceof Error ? err.message : String(err));
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, PERSIST_DEBOUNCE_MS);
  }

  private persist(): void {
    try {
      mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(this.runsPath, JSON.stringify(this.runs, null, 0), 'utf-8');
      writeFileSync(this.eventsPath, JSON.stringify(this.events, null, 0), 'utf-8');
    } catch (err) {
      console.warn('[WARNING] Failed to persist observability data:', err instanceof Error ? err.message : String(err));
    }
  }

  addRun(entry: RunEntry): void {
    this.activeRuns.delete(entry.requestId);
    this.runs.unshift(entry);
    if (this.runs.length > this.maxRuns) {
      this.runs.pop();
    }
    this.eventListeners.forEach((fn) =>
      fn({
        timestamp: entry.timestamp,
        tenantId: entry.tenantId,
        requestId: entry.requestId,
        eventType: 'run_complete',
        data: { ...entry } as Record<string, unknown>
      })
    );
    this.schedulePersist();
  }

  /** Emits run_start, adds to active runs. Call when a run begins. */
  addRunStart(requestId: string, tenantId?: string): void {
    this.activeRuns.set(requestId, {
      requestId,
      tenantId,
      startTime: Date.now(),
      currentState: 'observe',
      stateTrace: []
    });
    const entry: AuditEventEntry = {
      timestamp: Date.now(),
      requestId,
      tenantId,
      eventType: 'run_start',
      data: { requestId, tenantId }
    };
    this.events.unshift(entry);
    if (this.events.length > this.maxEvents) this.events.pop();
    this.eventListeners.forEach((fn) => fn(entry));
    this.schedulePersist();
  }

  addEvent(entry: AuditEventEntry): void {
    if (entry.eventType === 'run_progress' && entry.requestId) {
      const data = entry.data as { state?: string; stateTrace?: string[] };
      const active = this.activeRuns.get(entry.requestId);
      if (active) {
        active.currentState = data.state ?? active.currentState;
        active.stateTrace = data.stateTrace ?? active.stateTrace;
      }
    }
    this.events.unshift(entry);
    if (this.events.length > this.maxEvents) {
      this.events.pop();
    }
    this.eventListeners.forEach((fn) => fn(entry));
    this.schedulePersist();
  }

  getRuns(): RunEntry[] {
    return [...this.runs];
  }

  getActiveRuns(): ActiveRunEntry[] {
    return Array.from(this.activeRuns.values());
  }

  getEvents(): AuditEventEntry[] {
    return [...this.events];
  }

  subscribe(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  clear(): void {
    this.runs = [];
    this.events = [];
    this.activeRuns.clear();
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persist();
  }
}
