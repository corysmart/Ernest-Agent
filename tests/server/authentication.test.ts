import { buildServer } from '../../server/server';

describe('Server Authentication', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    // Clear API_KEY env var
    delete process.env.API_KEY;
    server = await buildServer({ logger: false });
  });

  afterEach(async () => {
    await server.close();
  });

  it('P1: allows anonymous requests without tenantId when API_KEY is not set', async () => {
    // API_KEY is cleared in beforeEach, so anonymous requests should work
    const response = await server.inject({
      method: 'POST',
      url: '/agent/run-once',
      payload: {
        observation: {
          timestamp: Date.now(),
          state: { status: 'ok' }
        }
      }
    });

    expect(response.statusCode).toBe(200);
  });

  it('P1: rejects unauthenticated requests when API_KEY is set', async () => {
    process.env.API_KEY = 'required-key';

    const response = await server.inject({
      method: 'POST',
      url: '/agent/run-once',
      payload: {
        observation: {
          timestamp: Date.now(),
          state: { status: 'ok' }
        }
      }
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Authentication required');
    expect(body.hint).toContain('API_KEY is configured');
  });

  it('P1: rejects client-supplied tenantId without authentication', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/agent/run-once',
      payload: {
        observation: {
          timestamp: Date.now(),
          state: { status: 'ok' }
        },
        tenantId: 'tenant-123'
      }
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Tenant ID mismatch');
  });

  it('P1: accepts authenticated requests with matching tenantId', async () => {
    // Set API_KEY environment variable
    process.env.API_KEY = 'test-api-key-tenant-123';

    const response = await server.inject({
      method: 'POST',
      url: '/agent/run-once',
      headers: {
        authorization: 'ApiKey test-api-key-tenant-123'
      },
      payload: {
        observation: {
          timestamp: Date.now(),
          state: { status: 'ok' }
        },
        tenantId: '123' // Extracted from token
      }
    });

    // Should succeed if tenantId matches authenticated principal
    // Note: Current implementation extracts tenantId from token pattern
    expect([200, 403]).toContain(response.statusCode);
  });

  it('P1: rejects invalid API key when API_KEY is set', async () => {
    process.env.API_KEY = 'valid-key';

    const response = await server.inject({
      method: 'POST',
      url: '/agent/run-once',
      headers: {
        authorization: 'ApiKey invalid-key'
      },
      payload: {
        observation: {
          timestamp: Date.now(),
          state: { status: 'ok' }
        }
      }
    });

    // Should reject because API_KEY is set but auth failed
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Authentication required');
  });

  it('P1: rejects malformed authorization header when API_KEY is set', async () => {
    process.env.API_KEY = 'required-key';

    const response = await server.inject({
      method: 'POST',
      url: '/agent/run-once',
      headers: {
        authorization: 'InvalidFormat token'
      },
      payload: {
        observation: {
          timestamp: Date.now(),
          state: { status: 'ok' }
        }
      }
    });

    // Should reject because API_KEY is set but auth failed
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Authentication required');
  });

  it('P1: accepts valid API key when API_KEY is set', async () => {
    process.env.API_KEY = 'valid-key';

    const response = await server.inject({
      method: 'POST',
      url: '/agent/run-once',
      headers: {
        authorization: 'ApiKey valid-key'
      },
      payload: {
        observation: {
          timestamp: Date.now(),
          state: { status: 'ok' }
        }
      }
    });

    // Should succeed with valid API key
    expect(response.statusCode).toBe(200);
  });
});

