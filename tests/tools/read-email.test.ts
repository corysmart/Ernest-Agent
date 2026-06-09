/**
 * Tests for read_email tool.
 */

import { generateKeyPairSync } from 'crypto';
import { readEmail } from '../../tools/read-email';

describe('read_email tool', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ERNEST_MAIL_URL;
    delete process.env.ERNEST_MAIL_AGENT_ID;
    delete process.env.ERNEST_MAIL_ATTESTATION_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('returns error when ERNEST_MAIL_URL is not configured', async () => {
    const result = await readEmail({ action: 'list' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('ERNEST_MAIL_URL');
  });

  it('returns error when attestation not configured', async () => {
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100';
    process.env.ERNEST_MAIL_API_KEY = 'secret';
    const result = await readEmail({ action: 'list' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('ERNEST_MAIL_AGENT_ID');
  });

  it('list: calls ernest-mail and returns emails when enabled', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100';
    process.env.ERNEST_MAIL_API_KEY = 'secret';
    process.env.ERNEST_MAIL_AGENT_ID = 'agent-1';
    process.env.ERNEST_MAIL_ATTESTATION_PRIVATE_KEY = privateKeyPem;

    const mockData = {
      object: 'list',
      has_more: false,
      data: [{ id: 'e1', from: 'a@b.com', to: ['c@d.com'], subject: 'Hi', created_at: '2025-01-01T00:00:00Z' }]
    };
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as jest.MockedFunction<typeof fetch>;

    const result = await readEmail({ action: 'list' });
    expect(result.success).toBe(true);
    expect((result as { count?: number }).count).toBe(1);
    expect((result as { emails?: unknown[] }).emails).toHaveLength(1);
  });

  it('get: returns error when id is missing', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100';
    process.env.ERNEST_MAIL_API_KEY = 'secret';
    process.env.ERNEST_MAIL_AGENT_ID = 'agent-1';
    process.env.ERNEST_MAIL_ATTESTATION_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

    const result = await readEmail({ action: 'get' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('id');
  });
});
