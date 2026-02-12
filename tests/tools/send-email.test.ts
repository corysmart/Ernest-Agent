/**
 * Tests for send_email tool.
 */

import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { sendEmail } from '../../tools/send-email';

describe('send_email', () => {
  let tmpDir: string;
  const orig = process.env;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'send-email-'));
    process.env = { ...orig };
    process.env.EMAIL_CONFIG_PATH = join(tmpDir, 'email-config.json');
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
  afterAll(() => {
    process.env = orig;
  });

  it('returns error when to is missing', async () => {
    const result = await sendEmail({ subject: 'Hi', body: 'Hello' });
    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('to');
  });

  it('returns error when subject is missing', async () => {
    const result = await sendEmail({ to: 'a@b.com', body: 'Hello' });
    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('subject');
  });

  it('returns error when body is missing', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    const result = await sendEmail({ to: 'a@b.com', subject: 'Hi' });
    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('body');
  });

  it('returns error when SMTP not configured', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const result = await sendEmail({
      to: 'a@b.com',
      subject: 'Hi',
      body: 'Hello'
    });
    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('not configured');
  });
});
