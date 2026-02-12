/**
 * Tests for save_email_config tool.
 */

import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { saveEmailConfigTool } from '../../tools/save-email-config';

describe('save_email_config', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'save-email-config-'));
    process.env.EMAIL_CONFIG_PATH = join(tmpDir, 'email-config.json');
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns error when host is missing', async () => {
    const result = await saveEmailConfigTool({ user: 'u', pass: 'p' });
    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('host');
  });

  it('returns error when user is missing', async () => {
    const result = await saveEmailConfigTool({ host: 'smtp.example.com', pass: 'p' });
    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('user');
  });

  it('returns error when pass is missing', async () => {
    const result = await saveEmailConfigTool({ host: 'smtp.example.com', user: 'u' });
    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('pass');
  });

  it('saves config when valid', async () => {
    const result = await saveEmailConfigTool({
      host: 'smtp.gmail.com',
      user: 'me@gmail.com',
      pass: 'app-password',
      port: 587,
      from: 'me@gmail.com'
    });
    expect(result.success).toBe(true);
    expect(existsSync(process.env.EMAIL_CONFIG_PATH!)).toBe(true);
    const raw = readFileSync(process.env.EMAIL_CONFIG_PATH!, 'utf-8');
    const config = JSON.parse(raw);
    expect(config.type).toBe('smtp');
    expect(config.host).toBe('smtp.gmail.com');
    expect(config.user).toBe('me@gmail.com');
    expect(config.pass).toBe('app-password');
    expect(config.port).toBe(587);
    expect(config.from).toBe('me@gmail.com');
  });
});
