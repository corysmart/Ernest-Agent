import { spawn } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { CodexLLMAdapter } from '../../llm/adapters/codex-adapter';

jest.mock('child_process');

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;
const ORIGINAL_CODEX_CWD = process.env.CODEX_CWD;
const ORIGINAL_OPENCLAW_WORKSPACE_ROOT = process.env.OPENCLAW_WORKSPACE_ROOT;
const ORIGINAL_FILE_WORKSPACE_ROOT = process.env.FILE_WORKSPACE_ROOT;
const ORIGINAL_RISKY_WORKSPACE_MODE = process.env.RISKY_WORKSPACE_MODE;
const ORIGINAL_CODEX_SANDBOX_MODE = process.env.CODEX_SANDBOX_MODE;

function createMockChild(stdout = '') {
  const mockChild = {
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
    once: jest.fn(),
    pid: 12345
  };
  const onImpl = (ev: string, fn: (...args: unknown[]) => void) => {
    if (ev === 'close') setImmediate(() => fn(0, null));
    return mockChild;
  };
  mockChild.on.mockImplementation(onImpl);
  mockChild.once.mockImplementation(onImpl);
  (mockChild.stdout.on as jest.Mock).mockImplementation((ev: string, fn: (chunk: Buffer) => void) => {
    if (ev === 'data') setImmediate(() => fn(Buffer.from(stdout)));
    return mockChild.stdout;
  });
  (mockChild.stderr.on as jest.Mock).mockImplementation(() => mockChild.stderr);
  return mockChild;
}

describe('CodexLLMAdapter', () => {
  const cleanupDirs: string[] = [];

  beforeEach(() => {
    mockedSpawn.mockReset();
    delete process.env.CODEX_CWD;
    delete process.env.OPENCLAW_WORKSPACE_ROOT;
    delete process.env.FILE_WORKSPACE_ROOT;
    delete process.env.RISKY_WORKSPACE_MODE;
    delete process.env.CODEX_SANDBOX_MODE;
  });

  afterEach(() => {
    process.env.CODEX_CWD = ORIGINAL_CODEX_CWD;
    process.env.OPENCLAW_WORKSPACE_ROOT = ORIGINAL_OPENCLAW_WORKSPACE_ROOT;
    process.env.FILE_WORKSPACE_ROOT = ORIGINAL_FILE_WORKSPACE_ROOT;
    process.env.RISKY_WORKSPACE_MODE = ORIGINAL_RISKY_WORKSPACE_MODE;
    process.env.CODEX_SANDBOX_MODE = ORIGINAL_CODEX_SANDBOX_MODE;
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (!dir) continue;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when messages are empty', async () => {
    const adapter = new CodexLLMAdapter();
    await expect(adapter.generate({ messages: [] })).rejects.toThrow('Prompt messages are required');
  });

  it('generates and returns content on success', async () => {
    mockedSpawn.mockReturnValue(createMockChild('Hello world') as never);

    const adapter = new CodexLLMAdapter({ timeoutMs: 5000 });
    const result = await adapter.generate({
      messages: [{ role: 'user', content: 'hi' }]
    });

    expect(result.content).toBe('Hello world');
    expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
  });

  it('throws when runCodex returns success false', async () => {
    const mockChild = createMockChild();
    mockChild.on.mockImplementation((ev: string, fn: (...args: unknown[]) => void) => {
      if (ev === 'close') setImmediate(() => fn(1, null));
      return mockChild;
    });
    mockedSpawn.mockReturnValue(mockChild as never);

    const adapter = new CodexLLMAdapter({ timeoutMs: 5000 });
    await expect(
      adapter.generate({ messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow();
  });

  it('returns embeddings for text', async () => {
    const adapter = new CodexLLMAdapter();
    const vec = await adapter.embed('abc');
    expect(vec).toHaveLength(8);
  });

  it('returns zero vector for empty embed', async () => {
    const adapter = new CodexLLMAdapter();
    const vec = await adapter.embed('');
    expect(vec).toEqual(new Array(8).fill(0));
  });

  it('estimateCost returns 0', () => {
    const adapter = new CodexLLMAdapter();
    expect(adapter.estimateCost(100)).toBe(0);
  });

  it('uses cwd from options', async () => {
    mockedSpawn.mockReturnValue(createMockChild('x') as never);
    const adapter = new CodexLLMAdapter({ cwd: '/custom', timeoutMs: 5000 });
    await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });
    expect(mockedSpawn).toHaveBeenCalledWith(
      'codex',
      ['exec'],
      expect.objectContaining({ cwd: '/custom' })
    );
  });

  it('uses risky workspace root as default cwd when risky mode is enabled', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'codex-adapter-heartbeat-'));
    cleanupDirs.push(baseDir);
    const workspaceRoot = join(baseDir, 'Ernest Agent', 'workspace');
    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(join(baseDir, 'ernest-mail'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'HEARTBEAT.md'),
      '# HEARTBEAT: Build `ernest-mail`\n',
      'utf8'
    );

    process.env.OPENCLAW_WORKSPACE_ROOT = workspaceRoot;
    process.env.FILE_WORKSPACE_ROOT = workspaceRoot;
    process.env.RISKY_WORKSPACE_MODE = 'true';

    mockedSpawn.mockReturnValue(createMockChild('ok') as never);

    const adapter = new CodexLLMAdapter({ timeoutMs: 5000 });
    await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'codex',
      ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check'],
      expect.objectContaining({ cwd: baseDir })
    );
  });

  it('uses risky workspace root instead of prompt-derived target in risky mode', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'codex-adapter-prompt-'));
    cleanupDirs.push(baseDir);
    const workspaceRoot = join(baseDir, 'Ernest Agent', 'workspace');
    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(join(baseDir, 'ernest-mail'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'HEARTBEAT.md'),
      '# HEARTBEAT: Build `missing-repo`\n',
      'utf8'
    );

    process.env.OPENCLAW_WORKSPACE_ROOT = workspaceRoot;
    process.env.FILE_WORKSPACE_ROOT = workspaceRoot;
    process.env.RISKY_WORKSPACE_MODE = 'true';

    mockedSpawn.mockReturnValue(createMockChild('ok') as never);

    const adapter = new CodexLLMAdapter({ timeoutMs: 5000 });
    await adapter.generate({
      messages: [{ role: 'user', content: 'Please continue implementation in repo ernest-mail' }]
    });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'codex',
      ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check'],
      expect.objectContaining({ cwd: baseDir })
    );
  });

  it('passes --model when CODEX_MODEL env is set', async () => {
    const orig = process.env.CODEX_MODEL;
    process.env.CODEX_MODEL = 'gpt-5.2-codex';
    try {
      mockedSpawn.mockReturnValue(createMockChild('x') as never);
      const adapter = new CodexLLMAdapter({ timeoutMs: 5000 });
      await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });
      expect(mockedSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '--model', 'gpt-5.2-codex'],
        expect.any(Object)
      );
    } finally {
      process.env.CODEX_MODEL = orig;
    }
  });

  it('passes sandbox flag when configured', async () => {
    process.env.CODEX_SANDBOX_MODE = 'workspace-write';
    mockedSpawn.mockReturnValue(createMockChild('x') as never);
    const adapter = new CodexLLMAdapter({ timeoutMs: 5000 });
    await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });
    expect(mockedSpawn).toHaveBeenCalledWith(
      'codex',
      ['exec', '--sandbox', 'workspace-write'],
      expect.any(Object)
    );
  });

  it('handles spawn error event', async () => {
    const mockChild = createMockChild();
    mockChild.on.mockImplementation((ev: string, fn: (err: Error) => void) => {
      if (ev === 'error') setImmediate(() => fn(new Error('spawn ENOENT')));
      return mockChild;
    });
    mockChild.once.mockImplementation((_ev: string, _fn: () => void) => mockChild);
    mockedSpawn.mockReturnValue(mockChild as never);

    const adapter = new CodexLLMAdapter({ timeoutMs: 5000 });
    await expect(
      adapter.generate({ messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow();
  });

  it('uses timeoutMs from options over env', () => {
    const orig = process.env.CODEX_TIMEOUT_MS;
    process.env.CODEX_TIMEOUT_MS = '99999';
    const adapter = new CodexLLMAdapter({ timeoutMs: 12345 });
    expect(adapter).toBeDefined();
    process.env.CODEX_TIMEOUT_MS = orig;
  });
});
