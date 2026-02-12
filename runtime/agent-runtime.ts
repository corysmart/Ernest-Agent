/**
 * AgentRuntime orchestrates the agent run loop via heartbeat and event triggers.
 * Provides budget guardrails, circuit breaker, kill switch, and audit logging.
 */

import type {
  AgentRuntimeOptions,
  RuntimeAuditLogger,
  TenantBudget,
  CircuitBreakerConfig,
  KillSwitchState
} from './types';

interface TenantState {
  runTimestamps: number[];
  tokenTimestamps: Array<{ tokens: number; at: number }>;
  consecutiveFailures: number;
  circuitOpenedAt: number | null;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export class AgentRuntime {
  private readonly options: Required<
    Pick<
      AgentRuntimeOptions,
      | 'runProvider'
      | 'heartbeatIntervalMs'
      | 'getTime'
      | 'timers'
      | 'generateRunId'
    >
  > &
    Pick<
      AgentRuntimeOptions,
      'tenantBudgets' | 'circuitBreakerConfig' | 'killSwitch' | 'auditLogger'
    >;

  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  private readonly tenantStates = new Map<string, TenantState>();
  private readonly tenantLocks = new Map<string, Promise<void>>();
  private eventQueue: string[] = [];
  private processingEvents = false;
  private running = false;

  constructor(options: AgentRuntimeOptions) {
    this.options = {
      ...options,
      getTime: options.getTime ?? (() => Date.now()),
      timers: options.timers ?? {
        setInterval: globalThis.setInterval.bind(globalThis),
        clearInterval: globalThis.clearInterval.bind(globalThis)
      },
      generateRunId: options.generateRunId ?? ((tenantId: string) => {
        const hex = (Date.now().toString(36) + Math.random().toString(36).slice(2));
        return `run-${tenantId}-${hex}`;
      })
    };
  }

  /**
   * Starts the runtime with heartbeat for the given tenant.
   */
  start(tenantId: string): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.heartbeatHandle = this.options.timers.setInterval(() => {
      this.scheduleRun(tenantId);
    }, this.options.heartbeatIntervalMs);
  }

  /**
   * Stops the runtime and clears the heartbeat interval.
   */
  stop(): void {
    this.running = false;
    if (this.heartbeatHandle != null) {
      this.options.timers.clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
  }

  /**
   * Emits an event to trigger an immediate run for the tenant.
   * No-op when runtime is stopped.
   */
  emitEvent(tenantId: string): void {
    if (!this.running) {
      return;
    }
    this.eventQueue.push(tenantId);
    void this.processEventQueue();
  }

  private async processEventQueue(): Promise<void> {
    if (!this.running || this.processingEvents || this.eventQueue.length === 0) {
      return;
    }
    this.processingEvents = true;
    while (this.running && this.eventQueue.length > 0) {
      const tenantId = this.eventQueue.shift();
      if (tenantId) {
        await this.executeRun(tenantId).catch(() => {});
      }
    }
    if (!this.running) {
      this.eventQueue.length = 0;
    }
    this.processingEvents = false;
  }

  private scheduleRun(tenantId: string): void {
    if (!this.running) {
      return;
    }
    this.executeRun(tenantId).catch(() => {});
  }

  private async withTenantLock<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tenantLocks.get(tenantId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tenantLocks.set(tenantId, previous.then(() => current));
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async executeRun(tenantId: string): Promise<void> {
    return this.withTenantLock(tenantId, () => this.doExecuteRun(tenantId));
  }

  private async doExecuteRun(tenantId: string): Promise<void> {
    const now = this.options.getTime();

    if (this.options.killSwitch?.enabled) {
      this.logAudit(tenantId, undefined, 'run_blocked_kill_switch');
      return;
    }

    const runId = this.options.generateRunId(tenantId);

    if (!this.checkBudget(tenantId, now)) {
      this.logAudit(tenantId, runId, 'run_blocked_budget');
      return;
    }

    if (this.isCircuitOpen(tenantId, now)) {
      this.logAudit(tenantId, runId, 'run_blocked_circuit_breaker');
      return;
    }

    this.logAudit(tenantId, runId, 'run_started');

    try {
      const { result, tokensUsed } = await this.options.runProvider.runOnce({
        tenantId,
        runId
      });

      this.recordRun(tenantId, now, tokensUsed ?? 0);
      if (result.status === 'error') {
        this.recordFailure(tenantId, now);
      } else {
        this.recordSuccess(tenantId);
      }

      this.logAudit(tenantId, runId, 'run_completed', {
        status: result.status,
        tokensUsed: tokensUsed ?? 0
      });
    } catch (error) {
      this.recordRun(tenantId, now, 0);
      this.recordFailure(tenantId, now);
      this.logAudit(tenantId, runId, 'run_error', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private checkBudget(tenantId: string, now: number): boolean {
    const budget = this.options.tenantBudgets?.get(tenantId);
    if (!budget) {
      return true;
    }

    const state = this.getTenantState(tenantId);
    this.pruneOldRuns(state, now);
    this.pruneOldTokens(state, now);

    if (state.runTimestamps.length >= budget.maxRunsPerHour) {
      return false;
    }

    const tokensLast24h = state.tokenTimestamps.reduce((s, t) => s + t.tokens, 0);
    if (tokensLast24h >= budget.maxTokensPerDay) {
      return false;
    }

    return true;
  }

  private isCircuitOpen(tenantId: string, now: number): boolean {
    const config = this.options.circuitBreakerConfig?.get(tenantId);
    if (!config) {
      return false;
    }

    const state = this.getTenantState(tenantId);
    if (state.circuitOpenedAt == null) {
      return false;
    }

    if (now - state.circuitOpenedAt >= config.cooldownMs) {
      state.circuitOpenedAt = null;
      this.logAudit(tenantId, undefined, 'circuit_breaker_recovered');
      return false;
    }

    return true;
  }

  private getTenantState(tenantId: string): TenantState {
    let state = this.tenantStates.get(tenantId);
    if (!state) {
      state = {
        runTimestamps: [],
        tokenTimestamps: [],
        consecutiveFailures: 0,
        circuitOpenedAt: null
      };
      this.tenantStates.set(tenantId, state);
    }
    return state;
  }

  private pruneOldRuns(state: TenantState, now: number): void {
    const cutoff = now - MS_PER_HOUR;
    state.runTimestamps = state.runTimestamps.filter((t) => t > cutoff);
  }

  private pruneOldTokens(state: TenantState, now: number): void {
    const cutoff = now - MS_PER_DAY;
    state.tokenTimestamps = state.tokenTimestamps.filter((t) => t.at > cutoff);
  }

  private recordRun(tenantId: string, now: number, tokensUsed: number): void {
    const state = this.getTenantState(tenantId);
    state.runTimestamps.push(now);
    if (tokensUsed > 0) {
      state.tokenTimestamps.push({ tokens: tokensUsed, at: now });
    }
  }

  private recordFailure(tenantId: string, now: number): void {
    const state = this.getTenantState(tenantId);
    state.consecutiveFailures++;
    const config = this.options.circuitBreakerConfig?.get(tenantId);
    if (config && state.consecutiveFailures >= config.failureThreshold) {
      state.circuitOpenedAt = now;
      this.logAudit(tenantId, undefined, 'circuit_breaker_opened');
    }
  }

  private recordSuccess(tenantId: string): void {
    const state = this.getTenantState(tenantId);
    state.consecutiveFailures = 0;
  }

  private logAudit(
    tenantId: string,
    runId: string | undefined,
    event: Parameters<RuntimeAuditLogger['logRuntimeEvent']>[0]['event'],
    data?: Record<string, unknown>
  ): void {
    const logger = this.options.auditLogger;
    if (!logger) {
      return;
    }
    const entry = { tenantId, runId: runId ?? '', event, data };
    try {
      const result = logger.logRuntimeEvent(entry);
      if (result instanceof Promise || (result != null && typeof (result as { then?: unknown }).then === 'function')) {
        void (result as Promise<void>).catch(() => {});
      }
    } catch {
      // Best-effort: audit failures must not affect run flow or crash process
    }
  }
}
