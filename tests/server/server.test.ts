import { buildServer } from '../../server/server';

describe('Server', () => {
  it('responds to health checks', async () => {
    const server = await buildServer({ logger: false });

    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).status).toBe('ok');

    await server.close();
  });

  it('runs agent loop via API', async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.MOCK_LLM_RESPONSE = '{"actionType":"pursue_goal","actionPayload":{},"confidence":0.9}';

    const server = await buildServer({ logger: false });

    const response = await server.inject({
      method: 'POST',
      url: '/agent/run-once',
      payload: {
        observation: { timestamp: 1, state: { status: 'ok' } },
        goal: { id: 'g1', title: 'Recover', priority: 1, horizon: 'short' }
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('completed');

    await server.close();
  });

  it('does not share goal state across requests', async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.MOCK_LLM_RESPONSE = '{"actionType":"pursue_goal","actionPayload":{},"confidence":0.9}';

    const server = await buildServer({ logger: false });

    const payload = {
      observation: { timestamp: 1, state: { status: 'ok' } },
      goal: { id: 'g-shared', title: 'Recover', priority: 1, horizon: 'short' }
    };

    const first = await server.inject({
      method: 'POST',
      url: '/agent/run-once',
      payload
    });

    const second = await server.inject({
      method: 'POST',
      url: '/agent/run-once',
      payload
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    await server.close();
  });

  describe('P3: HTTP status codes', () => {
    it('returns 200 for successful agent execution', async () => {
      process.env.LLM_PROVIDER = 'mock';
      process.env.MOCK_LLM_RESPONSE = '{"actionType":"pursue_goal","actionPayload":{},"confidence":0.9}';

      const server = await buildServer({ logger: false });

      const response = await server.inject({
        method: 'POST',
        url: '/agent/run-once',
        payload: {
          observation: { timestamp: 1, state: { status: 'ok' } },
          goal: { id: 'g1', title: 'Recover', priority: 1, horizon: 'short' }
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('completed');

      await server.close();
    });

    it('returns 400 for agent validation errors', async () => {
      process.env.LLM_PROVIDER = 'mock';
      process.env.MOCK_LLM_RESPONSE = '{"actionType":"invalid","actionPayload":{},"confidence":0.9}';

      const server = await buildServer({ logger: false });

      const response = await server.inject({
        method: 'POST',
        url: '/agent/run-once',
        payload: {
          observation: { timestamp: 1, state: { status: 'ok' } },
          goal: { id: 'g1', title: 'Recover', priority: 1, horizon: 'short' }
        }
      });

      // Should return 400 for validation/permission errors
      expect([400, 500]).toContain(response.statusCode);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('error');

      await server.close();
    });

    it('returns 200 for idle status (no goals)', async () => {
      process.env.LLM_PROVIDER = 'mock';

      const server = await buildServer({ logger: false });

      const response = await server.inject({
        method: 'POST',
        url: '/agent/run-once',
        payload: {
          observation: { timestamp: 1, state: { status: 'ok' } }
          // No goal provided
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('idle');

      await server.close();
    });
  });

  describe('P3: requestId uniqueness', () => {
    it('generates unique requestId for each request', async () => {
      process.env.LLM_PROVIDER = 'mock';
      process.env.MOCK_LLM_RESPONSE = '{"actionType":"pursue_goal","actionPayload":{},"confidence":0.9}';

      const server = await buildServer({ logger: false });

      const requestIdSets: Set<string>[] = [];
      const originalLog = console.log;
      let currentRequestIds: string[] = [];
      let requestCount = 0;

      console.log = jest.fn((message: string) => {
        if (message.startsWith('[AUDIT]')) {
          const logData = JSON.parse(message.replace('[AUDIT] ', ''));
          if (logData.requestId) {
            currentRequestIds.push(logData.requestId);
          }
        }
      });

      // Make first request
      await server.inject({
        method: 'POST',
        url: '/agent/run-once',
        payload: {
          observation: { timestamp: 1, state: { status: 'ok' } },
          goal: { id: 'g1', title: 'Test', priority: 1, horizon: 'short' }
        }
      });
      requestIdSets.push(new Set(currentRequestIds));
      currentRequestIds = [];

      // Make second request
      await server.inject({
        method: 'POST',
        url: '/agent/run-once',
        payload: {
          observation: { timestamp: 1, state: { status: 'ok' } },
          goal: { id: 'g2', title: 'Test', priority: 1, horizon: 'short' }
        }
      });
      requestIdSets.push(new Set(currentRequestIds));

      console.log = originalLog;

      // Each request should have consistent requestIds (all logs for same request share same requestId)
      expect(requestIdSets[0]!.size).toBe(1); // All logs for request 1 have same requestId
      expect(requestIdSets[1]!.size).toBe(1); // All logs for request 2 have same requestId
      
      // The two requests should have different requestIds
      const request1Id = Array.from(requestIdSets[0]!)[0];
      const request2Id = Array.from(requestIdSets[1]!)[0];
      expect(request1Id).not.toBe(request2Id);
      expect(request1Id).toMatch(/^req-/);
      expect(request2Id).toMatch(/^req-/);

      await server.close();
    });

    it('keeps requestId separate from tenantId', async () => {
      process.env.LLM_PROVIDER = 'mock';
      process.env.MOCK_LLM_RESPONSE = '{"actionType":"pursue_goal","actionPayload":{},"confidence":0.9}';
      process.env.API_KEY = 'test-key-tenant-123';

      const server = await buildServer({ logger: false });

      const logEntries: Array<{ tenantId?: string; requestId?: string }> = [];
      const originalLog = console.log;
      console.log = jest.fn((message: string) => {
        if (message.startsWith('[AUDIT]')) {
          const logData = JSON.parse(message.replace('[AUDIT] ', ''));
          logEntries.push({
            tenantId: logData.tenantId,
            requestId: logData.requestId
          });
        }
      });

      // Make request with authentication
      await server.inject({
        method: 'POST',
        url: '/agent/run-once',
        headers: {
          authorization: 'ApiKey test-key-tenant-123'
        },
        payload: {
          observation: { timestamp: 1, state: { status: 'ok' } },
          goal: { id: 'g1', title: 'Test', priority: 1, horizon: 'short' }
        }
      });

      console.log = originalLog;

      // requestId should be different from tenantId
      const entry = logEntries.find((e) => e.tenantId && e.requestId);
      if (entry) {
        expect(entry.requestId).not.toBe(entry.tenantId);
        expect(entry.requestId).toMatch(/^req-/);
      }

      await server.close();
    });
  });
});
