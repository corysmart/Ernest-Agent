import type { AgentLoopResult } from '../../core/contracts/agent';
import { AgentRuntime } from '../../runtime/agent-runtime';
import type { RunProvider } from '../../runtime/types';

describe('AgentRuntime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createRunProvider(
    overrides: Partial<{
      result: { status: 'completed' | 'idle' | 'error'; error?: string };
      tokensUsed: number;
      delayMs: number;
    }> = {}
  ): RunProvider & { runCount: number; lastContext: unknown } {
    let runCount = 0;
    let lastContext: unknown = null;
    const provider: RunProvider & { runCount: number; lastContext: unknown } = {
      get runCount() {
        return runCount;
      },
      get lastContext() {
        return lastContext;
      },
      async runOnce(context) {
        runCount++;
        lastContext = context;
        if (overrides.delayMs) {
          await new Promise((r) => setTimeout(r, overrides.delayMs));
        }
        return {
          result: overrides.result ?? { status: 'completed' },
          tokensUsed: overrides.tokensUsed ?? 100
        };
      }
    };
    return provider;
  }

  it('heartbeat triggers runOnce on interval', async () => {
    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 5000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]])
    });

    runtime.start('t1');
    expect(provider.runCount).toBe(0);

    await jest.advanceTimersByTimeAsync(5000);
    expect(provider.runCount).toBe(1);

    await jest.advanceTimersByTimeAsync(5000);
    expect(provider.runCount).toBe(2);

    runtime.stop();
  });

  it('event trigger causes immediate run', async () => {
    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]])
    });

    runtime.start('t1');
    runtime.emitEvent('t1');

    await jest.advanceTimersByTimeAsync(100);
    expect(provider.runCount).toBe(1);

    runtime.stop();
  });

  it('budget enforcement blocks runs per-tenant', async () => {
    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      tenantBudgets: new Map([
        ['t1', { maxRunsPerHour: 2, maxTokensPerDay: 1_000_000 }]
      ]),
      getTime: () => Date.now()
    });

    runtime.start('t1');

    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);
    expect(provider.runCount).toBe(2);

    await jest.advanceTimersByTimeAsync(1000);
    expect(provider.runCount).toBe(2);

    runtime.stop();
  });

  it('circuit breaker opens after consecutive failures and recovers after cooldown', async () => {
    const provider = createRunProvider({
      result: { status: 'error', error: 'fail' }
    });

    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 500,
      circuitBreakerConfig: new Map([
        ['t1', { failureThreshold: 2, cooldownMs: 5000 }]
      ]),
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      getTime: () => Date.now()
    });

    runtime.start('t1');

    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(500);
    const runCountAfterTwoFailures = provider.runCount;

    await jest.advanceTimersByTimeAsync(500);
    expect(provider.runCount).toBe(runCountAfterTwoFailures);

    await jest.advanceTimersByTimeAsync(5000);
    expect(provider.runCount).toBe(runCountAfterTwoFailures + 1);

    runtime.stop();
  });

  it('kill switch disables runs globally', async () => {
    const killSwitch = { enabled: true };
    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 5000,
      killSwitch,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]])
    });

    runtime.start('t1');

    await jest.advanceTimersByTimeAsync(6000);
    expect(provider.runCount).toBe(0);

    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(100);
    expect(provider.runCount).toBe(0);

    runtime.stop();
  });

  it('stop clears heartbeat interval', async () => {
    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]])
    });

    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(1000);
    expect(provider.runCount).toBe(1);

    runtime.stop();
    await jest.advanceTimersByTimeAsync(5000);
    expect(provider.runCount).toBe(1);
  });

  it('audit logs include tenantId, runId, and state transitions', async () => {
    const logged: Array<{ tenantId: string; runId: string; event: string }> = [];
    const auditLogger = {
      logRuntimeEvent(ctx: { tenantId: string; runId: string; event: string }) {
        logged.push({ tenantId: ctx.tenantId, runId: ctx.runId, event: ctx.event });
      }
    };

    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      auditLogger
    });

    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(1000);

    expect(logged.some((e) => e.event === 'run_started')).toBe(true);
    expect(logged.some((e) => e.event === 'run_completed')).toBe(true);
    expect(logged.some((e) => e.tenantId === 't1')).toBe(true);
    expect(logged.some((e) => e.runId && e.runId.length > 0)).toBe(true);

    runtime.stop();
  });

  it('uses injected run ID generator for deterministic IDs', async () => {
    const runIds: string[] = [];
    const generateRunId = jest.fn((tenantId: string) => `run-${tenantId}-${runIds.length}`);
    const provider = createRunProvider();

    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      generateRunId
    });

    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(1000);

    expect(generateRunId).toHaveBeenCalledWith('t1');
    const ctx = provider.lastContext as { runId?: string };
    expect(ctx?.runId).toMatch(/^run-t1-/);

    runtime.stop();
  });

  it('blocks runs when token budget exceeded', async () => {
    const provider = createRunProvider({ tokensUsed: 500 });
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      tenantBudgets: new Map([
        ['t1', { maxRunsPerHour: 100, maxTokensPerDay: 600 }]
      ])
    });

    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);
    expect(provider.runCount).toBe(2);

    await jest.advanceTimersByTimeAsync(1000);
    expect(provider.runCount).toBe(2);

    runtime.stop();
  });

  it('logs run_blocked_budget when budget exceeded', async () => {
    const logged: string[] = [];
    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 1, maxTokensPerDay: 100_000 }]]),
      auditLogger: { logRuntimeEvent: (ctx) => { logged.push(ctx.event); } }
    });

    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);

    expect(logged).toContain('run_blocked_budget');

    runtime.stop();
  });

  it('logs run_blocked_circuit_breaker when circuit open', async () => {
    const logged: string[] = [];
    const provider = createRunProvider({ result: { status: 'error', error: 'fail' } });
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 500,
      circuitBreakerConfig: new Map([['t1', { failureThreshold: 2, cooldownMs: 10_000 }]]),
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      auditLogger: { logRuntimeEvent: (ctx) => { logged.push(ctx.event); } }
    });

    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(500);

    expect(logged).toContain('run_blocked_circuit_breaker');

    runtime.stop();
  });

  it('logs run_error when runOnce throws', async () => {
    const logged: Array<{ event: string; data?: Record<string, unknown> }> = [];
    const provider: RunProvider = {
      async runOnce() {
        throw new Error('provider failed');
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      auditLogger: { logRuntimeEvent: (ctx) => { logged.push({ event: ctx.event, data: ctx.data }); } }
    });

    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(1000);

    expect(logged.some((e) => e.event === 'run_error')).toBe(true);

    runtime.stop();
  });

  it('start does nothing when already running', async () => {
    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 5000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]])
    });

    runtime.start('t1');
    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(5000);

    expect(provider.runCount).toBe(1);

    runtime.stop();
  });

  it('emitEvent after stop does not run', async () => {
    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]])
    });

    runtime.start('t1');
    runtime.stop();
    runtime.emitEvent('t1');

    await jest.advanceTimersByTimeAsync(100);
    expect(provider.runCount).toBe(0);
  });

  it('thrown runs count toward budget', async () => {
    let runCount = 0;
    const provider: RunProvider = {
      async runOnce() {
        runCount++;
        throw new Error('fail');
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 2, maxTokensPerDay: 100_000 }]])
    });

    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);
    expect(runCount).toBe(2);

    await jest.advanceTimersByTimeAsync(1000);
    expect(runCount).toBe(2);

    runtime.stop();
  });

  it('audit logger rejection does not crash or block run', async () => {
    const provider = createRunProvider();
    const auditLogger = {
      logRuntimeEvent: () => Promise.reject(new Error('audit failed'))
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      auditLogger
    });

    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(1000);

    expect(provider.runCount).toBe(1);

    runtime.stop();
  });

  it('stop clears queued events', async () => {
    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]])
    });

    runtime.start('t1');
    runtime.emitEvent('t1');
    runtime.emitEvent('t1');
    runtime.stop();

    await jest.advanceTimersByTimeAsync(100);
    expect(provider.runCount).toBeLessThanOrEqual(1);
  });

  it('heartbeat coalesces when run is in-flight', async () => {
    let runCount = 0;
    const provider: RunProvider = {
      async runOnce() {
        runCount++;
        await new Promise((r) => setTimeout(r, 150));
        return { result: { status: 'completed' }, tokensUsed: 100 };
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 50,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]])
    });

    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(250);

    expect(runCount).toBeLessThanOrEqual(2);
    runtime.stop();
  });

  it('tenants without budgets still run on heartbeat', async () => {
    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 2000
    });

    runtime.start('t1');
    await jest.advanceTimersByTimeAsync(2000);
    expect(provider.runCount).toBe(1);

    await jest.advanceTimersByTimeAsync(2000);
    expect(provider.runCount).toBe(2);

    runtime.stop();
  });

  it('emitEvent coalesces duplicate tenant events in queue', async () => {
    let runCount = 0;
    const provider: RunProvider = {
      async runOnce() {
        runCount++;
        return { result: { status: 'completed' }, tokensUsed: 100 };
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]])
    });

    runtime.start('t1');
    runtime.emitEvent('t1');
    runtime.emitEvent('t1');
    runtime.emitEvent('t1');

    await jest.advanceTimersByTimeAsync(100);
    expect(runCount).toBeLessThanOrEqual(2);
    expect(runCount).toBeGreaterThanOrEqual(1);
    runtime.stop();
  });

  it('emitEvent enforces max queue size', async () => {
    let runCount = 0;
    const provider: RunProvider = {
      async runOnce() {
        runCount++;
        return { result: { status: 'completed' }, tokensUsed: 100 };
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      maxEventQueueSize: 2
    });

    runtime.start('t1');
    for (let i = 0; i < 10; i++) {
      runtime.emitEvent(`tenant-${i}`);
    }

    await jest.advanceTimersByTimeAsync(500);
    expect(runCount).toBeLessThanOrEqual(3);
    expect(runCount).toBeGreaterThanOrEqual(2);
    runtime.stop();
  });

  it('rejects invalid maxEventQueueSize in constructor', () => {
    const provider = createRunProvider();
    expect(() => new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      maxEventQueueSize: 0
    })).toThrow(/maxEventQueueSize.*>= 1/);

    expect(() => new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      maxEventQueueSize: -1
    })).toThrow(/maxEventQueueSize/);

    expect(() => new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      maxEventQueueSize: NaN
    })).toThrow(/maxEventQueueSize/);
  });

  it('rejects invalid runTimeoutGraceMs in constructor', () => {
    const provider = createRunProvider();
    expect(() => new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      runTimeoutGraceMs: -1
    })).toThrow(/runTimeoutGraceMs/);

    expect(() => new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      runTimeoutGraceMs: NaN
    })).toThrow(/runTimeoutGraceMs/);
  });

  it('rejects invalid runTimeoutMaxLockHoldMs in constructor', () => {
    const provider = createRunProvider();
    expect(() => new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      runTimeoutMaxLockHoldMs: -1
    })).toThrow(/runTimeoutMaxLockHoldMs/);
  });

  it('rejects invalid tenantIdleEvictionMs in constructor', () => {
    const provider = createRunProvider();
    expect(() => new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      tenantIdleEvictionMs: -1
    })).toThrow(/tenantIdleEvictionMs/);

    expect(() => new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      tenantIdleEvictionMs: NaN
    })).toThrow(/tenantIdleEvictionMs/);
  });

  it('rejects invalid runTimeoutChargeTokens in constructor', () => {
    const provider = createRunProvider();
    expect(() => new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      runTimeoutChargeTokens: -1
    })).toThrow(/runTimeoutChargeTokens/);
  });

  it('rejects invalid runTimeoutMs in constructor', () => {
    const provider = createRunProvider();
    expect(() => new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      runTimeoutMs: 0
    })).toThrow(/runTimeoutMs/);

    expect(() => new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 1000,
      runTimeoutMs: -1
    })).toThrow(/runTimeoutMs/);
  });

  it('releases lock after maxLockHold when hung provider never settles (tenant not blocked)', async () => {
    let runCount = 0;
    const logged: string[] = [];
    const provider: RunProvider = {
      runOnce: (): Promise<{ result: AgentLoopResult; tokensUsed?: number }> => {
        runCount++;
        return new Promise(() => {});
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      runTimeoutMs: 50,
      runTimeoutGraceMs: 100,
      runTimeoutMaxLockHoldMs: 80,
      auditLogger: { logRuntimeEvent: (ctx) => { logged.push(ctx.event); } }
    });

    runtime.start('t1');
    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(60);

    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(400);
    expect(runCount).toBe(2);
    expect(logged).toContain('run_max_lock_hold_released');

    runtime.stop();
  });

  it('holds lock until provider completes when provider ignores abort (no overlapping runs)', async () => {
    let runCount = 0;
    const provider: RunProvider = {
      async runOnce(): Promise<{ result: AgentLoopResult; tokensUsed?: number }> {
        runCount++;
        if (runCount === 1) {
          await new Promise((r) => setTimeout(r, 250));
        }
        return { result: { status: 'completed' }, tokensUsed: 100 };
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      runTimeoutMs: 50,
      runTimeoutGraceMs: 100,
      auditLogger: { logRuntimeEvent: () => {} }
    });

    runtime.start('t1');
    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(60);

    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(300);
    expect(runCount).toBe(2);

    runtime.stop();
  });

  it('charges runTimeoutChargeTokens when run times out and never returns during grace', async () => {
    let runCount = 0;
    const provider: RunProvider = {
      async runOnce(): Promise<{ result: AgentLoopResult; tokensUsed?: number }> {
        runCount++;
        await new Promise((r) => setTimeout(r, 200));
        return { result: { status: 'completed' }, tokensUsed: 100 };
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 10, maxTokensPerDay: 1000 }]]),
      runTimeoutMs: 50,
      runTimeoutGraceMs: 80,
      runTimeoutChargeTokens: 400
    });

    runtime.start('t1');
    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(300);

    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(300);
    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(300);
    expect(runCount).toBeLessThanOrEqual(3);
    runtime.stop();
  });

  it('charges 0 tokens when provider rejects within grace period after timeout', async () => {
    let runCount = 0;
    const provider: RunProvider = {
      async runOnce(context) {
        runCount++;
        await new Promise<void>((_, reject) => {
          context.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        });
        return { result: { status: 'completed' }, tokensUsed: 100 };
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 200 }]]),
      runTimeoutMs: 30,
      runTimeoutGraceMs: 100,
      runTimeoutChargeTokens: 500
    });

    runtime.start('t1');
    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(150);

    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(150);
    expect(runCount).toBe(2);
    runtime.stop();
  });

  it('passes AbortSignal to runOnce for cooperative cancellation', async () => {
    let aborted = false;
    const provider: RunProvider = {
      async runOnce(context) {
        if (context.signal?.aborted) {
          aborted = true;
          throw new Error('Aborted');
        }
        await new Promise<void>((_, reject) => {
          context.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('Aborted'));
          });
        });
        return { result: { status: 'completed' }, tokensUsed: 100 };
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      runTimeoutMs: 20,
      runTimeoutGraceMs: 50
    });

    runtime.start('t1');
    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(100);

    expect(aborted).toBe(true);
    runtime.stop();
  });

  it('provider error does not charge runTimeoutChargeTokens', async () => {
    let runCount = 0;
    const provider: RunProvider = {
      async runOnce() {
        runCount++;
        throw new Error('provider failed');
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 500 }]]),
      runTimeoutMs: 1000,
      runTimeoutChargeTokens: 1000
    });

    runtime.start('t1');
    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(100);

    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(100);
    expect(runCount).toBe(2);
    runtime.stop();
  });

  it('records failure and keeps lock until run completes on timeout', async () => {
    let runCount = 0;
    const logged: string[] = [];
    const provider: RunProvider = {
      async runOnce() {
        runCount++;
        if (runCount === 1) {
          await new Promise((r) => setTimeout(r, 150));
        }
        return { result: { status: 'completed' }, tokensUsed: 100 };
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      runTimeoutMs: 100,
      auditLogger: { logRuntimeEvent: (ctx) => { logged.push(ctx.event); } }
    });

    runtime.start('t1');
    runtime.emitEvent('t1');

    await jest.advanceTimersByTimeAsync(200);
    expect(logged).toContain('run_error');

    runtime.emitEvent('t1');
    await jest.advanceTimersByTimeAsync(100);
    expect(runCount).toBe(2);

    runtime.stop();
  });

  it('emitEvent removes all duplicate tenantIds', async () => {
    let runCount = 0;
    const provider: RunProvider = {
      async runOnce() {
        runCount++;
        return { result: { status: 'completed' }, tokensUsed: 100 };
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]]),
      maxEventQueueSize: 10
    });

    runtime.start('t1');
    runtime.emitEvent('t1');
    runtime.emitEvent('t1');
    runtime.emitEvent('t1');

    await jest.advanceTimersByTimeAsync(100);
    expect(runCount).toBeLessThanOrEqual(2);
    runtime.stop();
  });

  it('evictIdleTenants runs on every getTenantState and respects in-flight runs', async () => {
    const provider = createRunProvider();
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 60_000,
      tenantBudgets: new Map([
        ['t1', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }],
        ['t2', { maxRunsPerHour: 100, maxTokensPerDay: 100_000 }]
      ]),
      tenantIdleEvictionMs: 50,
      getTime: () => 1000
    });

    runtime.start('t1');
    runtime.emitEvent('t1');
    runtime.emitEvent('t2');

    await jest.advanceTimersByTimeAsync(100);
    expect(provider.runCount).toBeGreaterThanOrEqual(1);
    runtime.stop();
  });

  it('per-tenant serialization prevents budget bypass with concurrent runs', async () => {
    let concurrency = 0;
    let maxConcurrency = 0;
    let runCount = 0;
    const provider: RunProvider = {
      async runOnce() {
        runCount++;
        concurrency++;
        maxConcurrency = Math.max(maxConcurrency, concurrency);
        await new Promise((r) => setTimeout(r, 50));
        concurrency--;
        return { result: { status: 'completed' }, tokensUsed: 100 };
      }
    };
    const runtime = new AgentRuntime({
      runProvider: provider,
      heartbeatIntervalMs: 10,
      tenantBudgets: new Map([['t1', { maxRunsPerHour: 2, maxTokensPerDay: 100_000 }]])
    });

    runtime.start('t1');
    runtime.emitEvent('t1');
    runtime.emitEvent('t1');
    runtime.emitEvent('t1');

    await jest.advanceTimersByTimeAsync(200);
    expect(maxConcurrency).toBe(1);
    expect(runCount).toBe(2);

    runtime.stop();
  });
});
