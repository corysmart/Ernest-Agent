/**
 * In-memory ring buffers for runs and audit events.
 * Used by the observability UI when OBS_UI_ENABLED.
 */

const DEFAULT_MAX_RUNS = 100;
const DEFAULT_MAX_EVENTS = 500;

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

type EventListener = (event: AuditEventEntry) => void;

export class ObservabilityStore {
  private runs: RunEntry[] = [];
  private events: AuditEventEntry[] = [];
  private readonly maxRuns: number;
  private readonly maxEvents: number;
  private eventListeners: Set<EventListener> = new Set();

  constructor(options?: { maxRuns?: number; maxEvents?: number }) {
    this.maxRuns = options?.maxRuns ?? (Number(process.env.OBS_UI_MAX_RUNS) || DEFAULT_MAX_RUNS);
    this.maxEvents = options?.maxEvents ?? (Number(process.env.OBS_UI_MAX_EVENTS) || DEFAULT_MAX_EVENTS);
  }

  addRun(entry: RunEntry): void {
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
  }

  addEvent(entry: AuditEventEntry): void {
    this.events.unshift(entry);
    if (this.events.length > this.maxEvents) {
      this.events.pop();
    }
    this.eventListeners.forEach((fn) => fn(entry));
  }

  getRuns(): RunEntry[] {
    return [...this.runs];
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
  }
}
