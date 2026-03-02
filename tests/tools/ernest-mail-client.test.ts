import { generateKeyPairSync } from 'crypto';
import {
  createErnestMailAccount,
  getErnestMailConfigFromEnv,
  validateErnestMailEnv,
  sendViaErnestMail,
  registerErnestMailAgent
} from '../../tools/ernest-mail-client';

describe('ernest-mail client', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ERNEST_MAIL_URL;
    delete process.env.ERNEST_MAIL_API_KEY;
    delete process.env.ERNEST_MAIL_AGENT_ID;
    delete process.env.ERNEST_MAIL_ATTESTATION_PRIVATE_KEY;
    delete process.env.ERNEST_MAIL_REGISTRATION_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns disabled config when ERNEST_MAIL_URL is unset', () => {
    expect(getErnestMailConfigFromEnv()).toEqual({ enabled: false });
  });

  it('returns config error when URL is set without API key', () => {
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100';
    const validation = validateErnestMailEnv();
    expect(validation.enabled).toBe(true);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('ERNEST_MAIL_API_KEY');

    const config = getErnestMailConfigFromEnv();
    expect(config.enabled).toBe(true);
    expect(config.error).toContain('ERNEST_MAIL_API_KEY');
  });

  it('validates URL format and protocol', () => {
    process.env.ERNEST_MAIL_URL = 'ftp://example.com';
    process.env.ERNEST_MAIL_API_KEY = 'secret';
    const validation = validateErnestMailEnv();
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('http or https');
  });

  it('calls /accounts with api key auth', async () => {
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100/';
    process.env.ERNEST_MAIL_API_KEY = 'secret';

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'a1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      })
    ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const result = await createErnestMailAccount({
      email: 'agent@example.com',
      provider: 'local-dev'
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3100/accounts',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'ApiKey secret',
          'Content-Type': 'application/json'
        })
      })
    );
  });

  it('calls /emails/send and forwards tenant header', async () => {
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100';
    process.env.ERNEST_MAIL_API_KEY = 'secret';

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const result = await sendViaErnestMail({
      accountId: 'acct-1',
      to: 'u@example.com',
      subject: 'Hello',
      body: 'World',
      tenantId: 'tenant-a'
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3100/emails/send',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Tenant-Id': 'tenant-a'
        })
      })
    );
  });

  it('calls /emails/send with X-Attestation when attestation env is set', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100';
    process.env.ERNEST_MAIL_API_KEY = 'secret';
    process.env.ERNEST_MAIL_AGENT_ID = 'test-agent';
    process.env.ERNEST_MAIL_ATTESTATION_PRIVATE_KEY = privateKeyPem;

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'sent' }), {
        status: 202,
        headers: { 'content-type': 'application/json' }
      })
    ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const result = await sendViaErnestMail({
      accountId: 'acct-1',
      to: 'u@example.com',
      subject: 'Hello',
      body: 'World'
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3100/emails/send',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Attestation': expect.any(String)
        })
      })
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.headers).toBeDefined();
    const headers = init?.headers as Record<string, string>;
    expect(headers['X-Attestation']).toBeDefined();
    expect(headers['Authorization']).toBeUndefined();
  });

  it('calls /agents/self-register with token and proof-of-possession', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100';
    process.env.ERNEST_MAIL_API_KEY = 'secret';
    process.env.ERNEST_MAIL_AGENT_ID = 'reg-agent';
    process.env.ERNEST_MAIL_ATTESTATION_PRIVATE_KEY = privateKeyPem;
    process.env.ERNEST_MAIL_REGISTRATION_TOKEN = 'abc-123-token';

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ agentId: 'reg-agent', format: 'tpm' }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      })
    ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const result = await registerErnestMailAgent();

    expect(result.success).toBe(true);
    expect(result.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3100/agents/self-register',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String)
      })
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse((init?.body as string) ?? '{}');
    expect(body.agentId).toBe('reg-agent');
    expect(body.format).toBe('tpm');
    expect(body.token).toBe('abc-123-token');
    expect(body.publicKey).toBeDefined();
    expect(body.signature).toBeDefined();
    expect(body.payload).toMatchObject({ action: 'register', agentId: 'reg-agent' });
  });

  it('registerErnestMailAgent fails when token missing', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100';
    process.env.ERNEST_MAIL_API_KEY = 'secret';
    process.env.ERNEST_MAIL_AGENT_ID = 'reg-agent';
    process.env.ERNEST_MAIL_ATTESTATION_PRIVATE_KEY = privateKeyPem;

    const result = await registerErnestMailAgent();

    expect(result.success).toBe(false);
    expect(result.error).toContain('ERNEST_MAIL_REGISTRATION_TOKEN');
  });

  it('lazy registers on 401 then retries send', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100';
    process.env.ERNEST_MAIL_API_KEY = 'secret';
    process.env.ERNEST_MAIL_AGENT_ID = 'reg-agent';
    process.env.ERNEST_MAIL_ATTESTATION_PRIVATE_KEY = privateKeyPem;
    process.env.ERNEST_MAIL_REGISTRATION_TOKEN = 'reg-token';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ agentId: 'reg-agent', format: 'tpm' }), {
          status: 201,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'sent' }), {
          status: 202,
          headers: { 'content-type': 'application/json' }
        })
      ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const result = await sendViaErnestMail({
      accountId: 'acct-1',
      to: 'u@example.com',
      subject: 'Hello',
      body: 'World'
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3100/emails/send');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:3100/agents/self-register');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://127.0.0.1:3100/emails/send');
  });

  it('returns api error details for non-2xx responses', async () => {
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100';
    process.env.ERNEST_MAIL_API_KEY = 'secret';

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'insufficient credits' }), {
        status: 402,
        headers: { 'content-type': 'application/json' }
      })
    ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const result = await sendViaErnestMail({
      accountId: 'acct-1',
      to: 'u@example.com',
      subject: 'Hello',
      body: 'World'
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(402);
    expect(result.error).toBe('insufficient credits');
  });
});
