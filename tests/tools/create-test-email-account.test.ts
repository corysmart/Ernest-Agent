/**
 * Tests for create_test_email_account tool.
 */

import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestEmailAccount } from '../../tools/create-test-email-account';
import nodemailer from 'nodemailer';

jest.mock('nodemailer', () => ({
  createTestAccount: jest.fn()
}));

const mockCreateTestAccount = nodemailer.createTestAccount as jest.MockedFunction<typeof nodemailer.createTestAccount>;

describe('create_test_email_account', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'create-test-email-'));
    process.env.EMAIL_CONFIG_PATH = join(tmpDir, 'email-config.json');
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
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates account and saves config', async () => {
    const result = await createTestEmailAccount({});
    expect(result.success).toBe(true);
    expect((result as { email?: string }).email).toMatch(/@ethereal\.email/);
    expect(existsSync(process.env.EMAIL_CONFIG_PATH!)).toBe(true);
    const raw = readFileSync(process.env.EMAIL_CONFIG_PATH!, 'utf-8');
    const config = JSON.parse(raw);
    expect(config.type).toBe('ethereal');
    expect(config.user).toBeDefined();
    expect(config.pass).toBeDefined();
    expect(config.smtp?.host).toBeDefined();
  });
});
