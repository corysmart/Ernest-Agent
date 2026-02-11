/**
 * Minimal integration example for AgentRuntime.
 * Demonstrates wiring of RunProvider, budgets, circuit breaker, and kill switch.
 * Not wired into the HTTP server - standalone illustration.
 *
 * Run with: npx ts-node examples/runtime-integration.example.ts
 * (Requires build first: npm run build)
 */

import { AgentRuntime } from '../runtime/agent-runtime';
import type { RunProvider } from '../runtime/types';

// Example: Create a RunProvider that wraps your agent.
// The runtime never imports CognitiveAgent or server code.
function createExampleRunProvider(): RunProvider {
  return {
    async runOnce(context) {
      // In real integration, resolve CognitiveAgent from DI and call runOnce()
      console.log(`[example] run started: tenant=${context.tenantId} runId=${context.runId}`);
      return {
        result: { status: 'idle', stateTrace: [] },
        tokensUsed: 50
      };
    }
  };
}

function main(): void {
  const runProvider = createExampleRunProvider();

  const runtime = new AgentRuntime({
    runProvider,
    heartbeatIntervalMs: 10_000,
    tenantBudgets: new Map([
      ['tenant-1', { maxRunsPerHour: 10, maxTokensPerDay: 50_000 }]
    ]),
    circuitBreakerConfig: new Map([
      ['tenant-1', { failureThreshold: 3, cooldownMs: 30_000 }]
    ]),
    killSwitch: { enabled: false },
    auditLogger: {
      logRuntimeEvent(ctx) {
        console.log(`[audit] ${ctx.event} tenant=${ctx.tenantId} runId=${ctx.runId}`);
      }
    }
  });

  runtime.start('tenant-1');
  runtime.emitEvent('tenant-1');

  console.log('Runtime started. Stop with runtime.stop() when done.');
}

if (require.main === module) {
  main();
}
