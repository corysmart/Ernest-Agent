/**
 * Shared email config loading. Used by send_email and config tools.
 * Never writes to .env - uses a separate JSON config file.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const DEFAULT_PATH = 'data/email-config.json';

function resolveConfigPath(): string {
  const raw = process.env.EMAIL_CONFIG_PATH ?? DEFAULT_PATH;
  const expanded = raw.replace(/^~/, homedir());
  return resolve(process.cwd(), expanded);
}

export interface SmtpConfig {
  type: 'smtp';
  host: string;
  port: number;
  user: string;
  pass: string;
  from?: string;
}

export interface EtherealConfig {
  type: 'ethereal';
  user: string;
  pass: string;
  smtp: { host: string; port: number; secure: boolean };
  from?: string;
}

export type EmailConfig = SmtpConfig | EtherealConfig;

export function loadEmailConfig(): EmailConfig | null {
  const envHost = process.env.SMTP_HOST;
  const envUser = process.env.SMTP_USER;
  const envPass = process.env.SMTP_PASS;
  if (envHost && envUser && envPass) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    return {
      type: 'smtp',
      host: envHost,
      port: Number.isFinite(port) ? port : 587,
      user: envUser,
      pass: envPass,
      from: process.env.EMAIL_FROM ?? envUser
    };
  }
  const path = resolveConfigPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as EmailConfig;
    if (parsed?.type === 'smtp' || parsed?.type === 'ethereal') {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveEmailConfig(config: EmailConfig): void {
  const path = resolveConfigPath();
  const dir = resolve(path, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
}
