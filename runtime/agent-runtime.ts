/**
 * AgentRuntime orchestrates the agent run loop via heartbeat and event triggers.
 * Provides budget guardrails, circuit breaker, kill switch, and audit logging.
 * Holds the per-tenant lock until the provider's runOnce promise settles, preventing
 * overlapping runs even when the provider ignores AbortSignal.
 */

import type { AgentLoopResult } from '../core/contracts/agent';
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

const RUN_TIMEOUT_SENTINEL = Symbol('RunTimeout');

function isRunTimeoutError(error: unknown): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    RUN_TIMEOUT_SENTINEL in (error as object)
  );
}

export class AgentRuntime {
  private readonly options: Required<
    Pick<
      AgentRuntimeOptions,
      | 'runProvider'
      | 'heartbeatIntervalMs'
      | 'getTime'
      | 'timers'
      | 'generateRunId'
      | 'maxEventQueueSize'
      | 'runTimeoutMs'
      | 'runTimeoutGraceMs'
      | 'runTimeoutChargeTokens'
    >
  > &
    Pick<
      AgentRuntimeOptions,
      'tenantBudgets' | 'circuitBreakerConfig' | 'killSwitch' | 'auditLogger' | 'tenantIdleEvictionMs'
    >;

  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  private readonly tenantStates = new Map<string, TenantState>();
  private readonly tenantLocks = new Map<string, Promise<void>>();
  private readonly pendingHeartbeatRuns = new Set<string>();
  private readonly inFlightRunCount = new Map<string, number>();
  private readonly tenantLastActivityAt = new Map<string, number>();
  private eventQueue: string[] = [];
  private processingEvents = false;
  private running = false;

  constructor(options: AgentRuntimeOptions) {
    const rawMax = options.maxEventQueueSize ?? 100;
    const maxEventQueueSize = Math.floor(Number(rawMax));
    if (!Number.isFinite(maxEventQueueSize) || maxEventQueueSize < 1) {
      throw new Error(
        `maxEventQueueSize must be a finite integer >= 1. Got: ${options.maxEventQueueSize}`
      );
    }

    const rawTimeout = options.runTimeoutMs ?? 300_000;
    const runTimeoutMs = Math.floor(Number(rawTimeout));
    if (!Number.isFinite(runTimeoutMs) || runTimeoutMs < 1) {
      throw new Error(
        `runTimeoutMs must be a finite positive number. Got: ${options.runTimeoutMs}`
      );
    }

    const rawGrace = options.runTimeoutGraceMs ?? runTimeoutMs;
    const runTimeoutGraceMs = Math.floor(Number(rawGrace));
    if (!Number.isFinite(runTimeoutGraceMs) || runTimeoutGraceMs < 0) {
      throw new Error(
        `runTimeoutGraceMs must be a finite non-negative number. Got: ${options.runTimeoutGraceMs}`
      );
    }

    const rawCharge = options.runTimeoutChargeTokens ?? 512;
    const runTimeoutChargeTokens = Math.floor(Number(rawCharge));
    if (!Number.isFinite(runTimeoutChargeTokens) || runTimeoutChargeTokens < 0) {
      throw new Error(
        `runTimeoutChargeTokens must be a finite non-negative number. Got: ${options.runTimeoutChargeTokens}`
      );
    }

    if (options.tenantIdleEvictionMs !== undefined) {
      const ttl = Math.floor(Number(options.tenantIdleEvictionMs));
      if (!Number.isFinite(ttl) || ttl < 0) {
        throw new Error(
          `tenantIdleEvictionMs must be a finite non-negative number. Got: ${options.tenantIdleEvictionMs}`
        );
      }
    }

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
      }),
      maxEventQueueSize,
      runTimeoutMs,
      runTimeoutGraceMs,
      runTimeoutChargeTokens
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
   * Stops the runtime and clears the heartbeat interval and event queue.
   */
  stop(): void {
    this.running = false;
    this.eventQueue.length = 0;
    if (this.heartbeatHandle != null) {
      this.options.timers.clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
  }

  /**
   * Emits an event to trigger an immediate run for the tenant.
   * No-op when runtime is stopped.
   * Per-tenant coalescing: at most one pending event per tenant.
   * When queue is full, oldest events are dropped (backpressure).
   */
  emitEvent(tenantId: string): void {
    if (!this.running) {
      return;
    }
    this.touchTenant(tenantId);
    this.eventQueue = this.eventQueue.filter((id) => id !== tenantId);
    while (this.eventQueue.length >= this.options.maxEventQueueSize) {
      this.eventQueue.shift();
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
    if (this.pendingHeartbeatRuns.has(tenantId)) {
      return;
    }
    this.touchTenant(tenantId);
    this.pendingHeartbeatRuns.add(tenantId);
    this.executeRun(tenantId)
      .catch(() => {})
      .finally(() => {
        this.pendingHeartbeatRuns.delete(tenantId);
      });
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
    const prev = this.inFlightRunCount.get(tenantId) ?? 0;
    this.inFlightRunCount.set(tenantId, prev + 1);
    try {
      return await this.withTenantLock(tenantId, () => this.doExecuteRun(tenantId));
    } finally {
      const n = this.inFlightRunCount.get(tenantId)! - 1;
      if (n <= 0) {
        this.inFlightRunCount.delete(tenantId);
      } else {
        this.inFlightRunCount.set(tenantId, n);
      }
    }
  }

  private async doExecuteRun(tenantId: string): Promise<void> {
    this.touchTenant(tenantId);
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

    const controller = new AbortController();
    const runContext = { tenantId, runId, signal: controller.signal };
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
    const runPromise = this.options.runProvider.runOnce(runContext);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        const err = new Error(`Run timeout after ${this.options.runTimeoutMs}ms`);
        (err as Error & { [RUN_TIMEOUT_SENTINEL]: true })[RUN_TIMEOUT_SENTINEL] = true;
        reject(err);
      }, this.options.runTimeoutMs);
    });

    try {
      const { result, tokensUsed } = await Promise.race([runPromise, timeoutPromise]);
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }

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
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
      const timedOut = isRunTimeoutError(error);
      if (timedOut) {
        controller.abort();
      }
      this.recordFailure(tenantId, now);
      this.logAudit(tenantId, runId, 'run_error', {
        error: error instanceof Error ? error.message : String(error)
      });

      if (timedOut) {
        type GraceResult =
          | { ok: true; tokensUsed: number }
          | { ok: false; providerReturned: true }
          | { ok: false; providerReturned: false };
        const gracePromise = new Promise<GraceResult>((resolve) => {
          const tid = globalThis.setTimeout(
            () => resolve({ ok: false, providerReturned: false }),
            this.options.runTimeoutGraceMs
          );
          runPromise
            .then((r) => {
              clearTimeout(tid);
              resolve({ ok: true, tokensUsed: r.tokensUsed ?? 0 });
            })
            .catch(() => {
              clearTimeout(tid);
              resolve({ ok: false, providerReturned: true });
            });
        });

        const graceResult = await gracePromise;
        if (graceResult.ok) {
          this.recordRun(tenantId, now, graceResult.tokensUsed);
        } else if (graceResult.providerReturned) {
          this.recordRun(tenantId, now, 0);
        } else {
          this.recordRun(tenantId, now, this.options.runTimeoutChargeTokens);
        }
        // Hold lock until provider settles to prevent overlapping runs when it ignores abort
        await runPromise.catch(() => {});
      } else {
        const lateResult = await runPromise.catch(() => null);
        this.recordRun(tenantId, now, lateResult?.tokensUsed ?? 0);
      }
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

  private touchTenant(tenantId: string): void {
    this.tenantLastActivityAt.set(tenantId, this.options.getTime());
  }

  private evictIdleTenants(): void {
    const ttl = this.options.tenantIdleEvictionMs;
    if (ttl == null || ttl <= 0) {
      return;
    }
    const now = this.options.getTime();
    const cutoff = now - ttl;
    for (const [id, at] of this.tenantLastActivityAt.entries()) {
      if (at < cutoff && (this.inFlightRunCount.get(id) ?? 0) === 0) {
        this.tenantStates.delete(id);
        this.tenantLocks.delete(id);
        this.tenantLastActivityAt.delete(id);
      }
    }
  }

  private getTenantState(tenantId: string): TenantState {
    this.touchTenant(tenantId);
    this.evictIdleTenants();
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
    const budget = this.options.tenantBudgets?.get(tenantId);
    if (!budget) {
      return;
    }
    const state = this.getTenantState(tenantId);
    this.pruneOldRuns(state, now);
    this.pruneOldTokens(state, now);
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
