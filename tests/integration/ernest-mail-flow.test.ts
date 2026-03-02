/**
 * Integration tests for Agent -> ernest-mail flow.
 * Exercises create_test_email_account + send_email when ERNEST_MAIL is configured.
 */

import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir as osTmpdir } from 'os';
import { createTestEmailAccount } from '../../tools/create-test-email-account';
import { sendEmail } from '../../tools/send-email';
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
});
