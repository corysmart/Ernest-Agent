/**
 * E2E: create account + send email against live ernest-mail.
 * Spawns ernest-mail, registers agent with TPM attestation, runs full flow.
 * Skips if ernest-mail sibling repo is not present.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateKeyPairSync } from 'crypto';
import {
  createErnestMailAccount,
  registerErnestMailAgent,
  sendViaErnestMail
} from '../../tools/ernest-mail-client';

const ERNEST_MAIL_PORT = 31999;
const BASE_URL = `http://127.0.0.1:${ERNEST_MAIL_PORT}`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(url: string, timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // keep trying
    }
    await sleep(200);
  }
  return false;
}

describe('e2e: ernest-mail create + send (live)', () => {
  const ernestMailDir = join(process.cwd(), '..', 'ernest-mail');
  let child: ReturnType<typeof spawn> | null = null;
  let tmpDir: string;
  const originalEnv = process.env;

  beforeAll(async () => {
    if (!existsSync(join(ernestMailDir, 'package.json'))) {
      console.warn('ernest-mail sibling not found, skipping e2e');
      return;
    }

    tmpDir = mkdtempSync(join(tmpdir(), 'ernest-e2e-'));
    const env = {
      ...process.env,
      PORT: String(ERNEST_MAIL_PORT),
      API_KEY: 'e2e-key',
      ACCOUNTS_PATH: join(tmpDir, 'accounts.json'),
      WALLET_PATH: join(tmpDir, 'wallets.json'),
      AGENTS_PATH: join(tmpDir, 'agents.json')
    };

    child = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: ernestMailDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const ok = await waitForHealth(BASE_URL);
    if (!ok) {
      child.kill('SIGTERM');
      child = null;
      throw new Error('ernest-mail did not become ready');
    }
  }, 15000);

  afterAll(() => {
    if (child) {
      child.kill('SIGTERM');
      child = null;
    }
    if (typeof tmpDir !== 'undefined') {
      rmSync(tmpDir, { recursive: true, force: true });
    }
    process.env = originalEnv;
  });

  it('registers agent, creates account, sends email with attestation', async () => {
    if (!existsSync(join(ernestMailDir, 'package.json'))) return;

    const tokRes = await fetch(`${BASE_URL}/tokens`, {
      method: 'POST',
      headers: { Authorization: 'ApiKey e2e-key', 'Content-Type': 'application/json' },
      body: '{}'
    });
    expect(tokRes.ok).toBe(true);
    const tokData = (await tokRes.json()) as { tokens: string[] };
    const token = tokData.tokens[0];

    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

    process.env.ERNEST_MAIL_URL = BASE_URL;
    process.env.ERNEST_MAIL_API_KEY = 'e2e-key';
    process.env.ERNEST_MAIL_AGENT_ID = 'e2e-agent';
    process.env.ERNEST_MAIL_ATTESTATION_PRIVATE_KEY = privateKeyPem;
    process.env.ERNEST_MAIL_REGISTRATION_TOKEN = token;

    const reg = await registerErnestMailAgent();
    expect(reg.success).toBe(true);
    expect(reg.status).toBe(201);

    const create = await createErnestMailAccount({
      email: `e2e-${Date.now()}@example.com`,
      provider: 'local-dev'
    });
    expect(create.success).toBe(true);
    expect(create.status).toBe(201);
    const accountId = (create.data as { id?: string })?.id;
    expect(accountId).toBeDefined();

    const send = await sendViaErnestMail({
      accountId,
      to: 'recipient@example.com',
      subject: 'E2E test',
      body: 'Hello from ernest-mail e2e'
    });
    expect(send.success).toBe(true);
    expect([200, 202]).toContain(send.status);
  });
});
