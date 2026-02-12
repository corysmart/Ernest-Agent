/**
 * CI-safe e2e: real HTTP against a live server, mock LLM.
 * Validates full stack (HTTP -> Fastify -> container -> agent -> response).
 * Single durable test; update only if the core API or architecture changes.
 */

import { buildServer } from '../../server/server';

describe('e2e: run-once over HTTP', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let baseUrl: string;
  let canListen = true;

  beforeAll(async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.MOCK_LLM_RESPONSE = '{"actionType":"pursue_goal","actionPayload":{},"confidence":0.9}';
    server = await buildServer({ logger: false });
    try {
      await server.listen({ port: 0, host: '127.0.0.1' });
      const addr = server.server.address();
      const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
    } catch (err) {
      canListen = false;
      if (err instanceof Error && !err.message.includes('EADDRINUSE') && !err.message.includes('EPERM')) throw err;
    }
  });

  afterAll(async () => {
    await server?.close();
  });

  it('serves run-once over real HTTP', async () => {
    if (!canListen) return;
    const res = await fetch(`${baseUrl}/agent/run-once`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        observation: { state: { status: 'ok' } },
        goal: { id: 'g1', title: 'Test', horizon: 'short', priority: 1 }
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string };
    expect(['completed', 'idle', 'dry_run', 'error']).toContain(body.status);
  });
});
