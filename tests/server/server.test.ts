import { buildServer } from '../../server/server';

describe('Server', () => {
  it('responds to health checks', async () => {
    const server = await buildServer();

    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).status).toBe('ok');

    await server.close();
  });

  it('runs agent loop via API', async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.MOCK_LLM_RESPONSE = '{"actionType":"pursue_goal","actionPayload":{},"confidence":0.9}';

    const server = await buildServer();

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

    const server = await buildServer();

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
});
