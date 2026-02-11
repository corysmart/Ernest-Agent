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
});
