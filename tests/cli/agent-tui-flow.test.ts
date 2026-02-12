/**
 * Tests the flow that the ernest-agent TUI uses: dry run with clarifying question,
 * then follow-up with conversation_history. Uses real HTTP against a live server.
 */

import { buildServer } from '../../server/server';
import { extractAssistantContent, type RunOnceResponse } from '../../cli/agent-tui-helpers';

describe('agent-tui flow (e2e)', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.MOCK_LLM_RESPONSE = '{"actionType":"pursue_goal","actionPayload":{"response":"I need more details: which file, and what error?"},"confidence":0.85,"reasoning":"Clarifying"}';
    server = await buildServer({ logger: false });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await server?.close();
  });

  it('dry run with underspecified prompt returns clarifying question, then follow-up succeeds', async () => {
    // Step 1: Dry run with "Fix the bug" (no explicit goal -> auto-inject Respond to user)
    const run1 = await fetch(`${baseUrl}/agent/run-once`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        observation: { state: { user_message: 'Fix the bug' } },
        dryRun: 'with-llm'
      })
    });

    expect(run1.status).toBe(200);
    const result1 = (await run1.json()) as RunOnceResponse;
    expect(result1.status).toBe('dry_run');

    const assistantContent = extractAssistantContent(result1);
    expect(assistantContent).toContain('I need more details');

    // Step 2: Follow-up with conversation_history (simulates "Send follow-up" in TUI)
    const run2 = await fetch(`${baseUrl}/agent/run-once`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        observation: {
          state: { user_message: 'main.ts, TypeError on line 42' },
          conversation_history: [
            { role: 'user', content: 'Fix the bug' },
            { role: 'assistant', content: assistantContent }
          ]
        },
        goal: { id: 'respond-1', title: 'Respond to user', horizon: 'short', priority: 1 },
        dryRun: 'with-llm'
      })
    });

    expect(run2.status).toBe(200);
    const result2 = (await run2.json()) as { status: string };
    expect(result2.status).toBe('dry_run');
  });
});
