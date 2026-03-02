/**
 * Integration tests for Agent -> ernest-mail flow.
 * Exercises create_test_email_account + send_email when ERNEST_MAIL is configured.
 */

import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir as osTmpdir } from 'os';
import { generateKeyPairSync } from 'crypto';
import { createTestEmailAccount } from '../../tools/create-test-email-account';
import { sendEmail } from '../../tools/send-email';
import { sendViaErnestMail } from '../../tools/ernest-mail-client';
import nodemailer from 'nodemailer';

jest.mock('nodemailer', () => ({
  createTestAccount: jest.fn()
}));

const mockCreateTestAccount = nodemailer.createTestAccount as jest.MockedFunction<typeof nodemailer.createTestAccount>;

describe('Agent -> ernest-mail integration flow', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(osTmpdir(), 'ernest-mail-flow-'));
    process.env = { ...originalEnv };
    process.env.EMAIL_CONFIG_PATH = join(tmpDir, 'email-config.json');
    process.env.ERNEST_MAIL_URL = 'http://127.0.0.1:3100';
    process.env.ERNEST_MAIL_API_KEY = 'secret';
    mockCreateTestAccount.mockClear();
    mockCreateTestAccount.mockResolvedValue({
      user: 'test@ethereal.email',
      pass: 'secret',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
      imap: { host: 'imap.ethereal.email', port: 993, secure: true },
      pop3: { host: 'pop3.ethereal.email', port: 995, secure: true },
      web: 'https://ethereal.email'
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('creates account then sends email via ernest-mail', async () => {
    const createdAccountId = 'acct-created-' + Date.now();
    const fetchMock = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : (url as URL).toString();
      const body = init?.body ? JSON.parse(init.body as string) : {};
      if (u.includes('/accounts')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: createdAccountId }), {
            status: 201,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      if (u.includes('/emails/send')) {
        expect(body.accountId).toBe(createdAccountId);
        expect(body.to).toBe('recipient@example.com');
        expect(body.subject).toBe('Test subject');
        expect(body.text).toBe('Test body');
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${u}`));
    }) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const createResult = await createTestEmailAccount({ email: 'agent@ernest.local' });
    expect(createResult.success).toBe(true);
    const accountId = (createResult as { accountId?: string }).accountId;
    expect(accountId).toBe(createdAccountId);

    const sendResult = await sendEmail({
      accountId,
      to: 'recipient@example.com',
      subject: 'Test subject',
      body: 'Test body'
    });
    expect(sendResult.success).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:3100/accounts',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'ApiKey secret',
          'Content-Type': 'application/json'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:3100/emails/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'ApiKey secret'
        })
      })
    );
  });

  it('create returns accountId that send_email requires', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'acct-x' }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      })
    ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const createResult = await createTestEmailAccount({});
    expect(createResult.success).toBe(true);
    const accountId = (createResult as { accountId?: string }).accountId;
    expect(accountId).toBe('acct-x');

    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as jest.MockedFunction<typeof fetch>;

    const sendResult = await sendEmail({
      accountId: accountId!,
      to: 'u@example.com',
      subject: 'Hello',
      body: 'World'
    });
    expect(sendResult.success).toBe(true);
  });

  it('sendViaErnestMail with attestation: lazy registers with token on 401 then retries', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    process.env.ERNEST_MAIL_AGENT_ID = 'flow-agent';
    process.env.ERNEST_MAIL_ATTESTATION_PRIVATE_KEY = privateKeyPem;
    process.env.ERNEST_MAIL_REGISTRATION_TOKEN = 'integration-token';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ agentId: 'flow-agent', format: 'tpm' }), {
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
    const selfRegBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit)?.body as string);
    expect(selfRegBody.token).toBe('integration-token');
  });
});
