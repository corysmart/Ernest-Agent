import {
  createErnestMailAccount,
  getErnestMailConfigFromEnv,
  validateErnestMailEnv,
  sendViaErnestMail
} from '../../tools/ernest-mail-client';

describe('ernest-mail client', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ERNEST_MAIL_URL;
    delete process.env.ERNEST_MAIL_API_KEY;
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
