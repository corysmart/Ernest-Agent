import { spawn } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { invokeCodex } from '../../tools/invoke-codex';

jest.mock('child_process');

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;
const ORIGINAL_CODEX_CWD = process.env.CODEX_CWD;
const ORIGINAL_OPENCLAW_WORKSPACE_ROOT = process.env.OPENCLAW_WORKSPACE_ROOT;
const ORIGINAL_FILE_WORKSPACE_ROOT = process.env.FILE_WORKSPACE_ROOT;
const ORIGINAL_RISKY_WORKSPACE_MODE = process.env.RISKY_WORKSPACE_MODE;
const ORIGINAL_RISKY_WORKSPACE_ROOT = process.env.RISKY_WORKSPACE_ROOT;
const ORIGINAL_CODEX_SANDBOX_MODE = process.env.CODEX_SANDBOX_MODE;

describe('invoke_codex', () => {
  const cleanupDirs: string[] = [];

  beforeEach(() => {
    mockedSpawn.mockReset();
    delete process.env.CODEX_CWD;
    delete process.env.OPENCLAW_WORKSPACE_ROOT;
    delete process.env.FILE_WORKSPACE_ROOT;
    delete process.env.RISKY_WORKSPACE_MODE;
    delete process.env.RISKY_WORKSPACE_ROOT;
    delete process.env.CODEX_SANDBOX_MODE;
  });

  afterEach(() => {
    process.env.CODEX_CWD = ORIGINAL_CODEX_CWD;
    process.env.OPENCLAW_WORKSPACE_ROOT = ORIGINAL_OPENCLAW_WORKSPACE_ROOT;
    process.env.FILE_WORKSPACE_ROOT = ORIGINAL_FILE_WORKSPACE_ROOT;
    process.env.RISKY_WORKSPACE_MODE = ORIGINAL_RISKY_WORKSPACE_MODE;
    process.env.RISKY_WORKSPACE_ROOT = ORIGINAL_RISKY_WORKSPACE_ROOT;
    process.env.CODEX_SANDBOX_MODE = ORIGINAL_CODEX_SANDBOX_MODE;
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (!dir) continue;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns error when prompt and goal are missing', async () => {
    const result = await invokeCodex({});
    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('prompt');
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('accepts goal as alias for prompt', async () => {
    const mockChild: {
      stdout: { on: jest.Mock };
      stderr: { on: jest.Mock };
      on: jest.Mock;
    } = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn()
    };
    mockChild.on.mockImplementation((ev: string, fn: (...args: unknown[]) => void) => {
      if (ev === 'close') setImmediate(() => fn(0, null));
      return mockChild;
    });
    mockedSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

    const result = await invokeCodex({ goal: 'Do something' });
    expect(result.success).toBe(true);
    expect(mockedSpawn).toHaveBeenCalledWith('codex', ['exec'], expect.any(Object));
  });

  it('returns error when prompt is not a string', async () => {
    const result = await invokeCodex({ prompt: 123 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('prompt');
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('returns error when prompt is empty', async () => {
    const result = await invokeCodex({ prompt: '   ' });
    expect(result.success).toBe(false);
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('spawns codex with prompt and returns stdout on success', async () => {
    const mockChild: {
      stdout: { on: jest.Mock };
      stderr: { on: jest.Mock };
      on: jest.Mock;
    } = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn()
    };
    mockChild.on.mockImplementation((ev: string, fn: (...args: unknown[]) => void) => {
      if (ev === 'close') {
        setImmediate(() => fn(0, null));
      }
      return mockChild;
    });

    mockedSpawn.mockReturnValue(mockChild as never);

    (mockChild.stdout as { on: jest.Mock }).on.mockImplementation((ev: string, fn: (chunk: Buffer) => void) => {
      if (ev === 'data') {
        setTimeout(() => fn(Buffer.from('Done.')), 0);
      }
      return mockChild;
    });
    (mockChild.stderr as { on: jest.Mock }).on.mockImplementation(() => mockChild);

    const resultPromise = invokeCodex({
      prompt: 'Summarize this project.'
    });

    await new Promise((r) => setTimeout(r, 20));
    (mockChild.on as jest.Mock).mock.calls
      .find((call: unknown[]) => call[0] === 'close')?.[1]?.(0, null);

    const result = await resultPromise;

    expect(mockedSpawn).toHaveBeenCalledWith(
      'codex',
      ['exec'],
      expect.objectContaining({
        cwd: process.cwd(),
        shell: false
      })
    );
    expect(mockedSpawn.mock.calls[0]![2]!.stdio![0]).toBeGreaterThanOrEqual(0);
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('uses cwd when provided and within workspace', async () => {
    const mockChild: {
      stdout: { on: jest.Mock };
      stderr: { on: jest.Mock };
      on: jest.Mock;
    } = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn()
    };
    mockChild.on.mockImplementation((ev: string, fn: (...args: unknown[]) => void) => {
      if (ev === 'close') {
        setImmediate(() => fn(0, null));
      }
      return mockChild;
    });

    mockedSpawn.mockReturnValue(mockChild as never);
    (mockChild.stdout as { on: jest.Mock }).on.mockImplementation(() => mockChild);
    (mockChild.stderr as { on: jest.Mock }).on.mockImplementation(() => mockChild);

    const result = await invokeCodex({
      prompt: 'Fix bugs.',
      cwd: '.' // within workspace
    });

    expect(result.success).toBe(true);
    expect(mockedSpawn).toHaveBeenCalledWith(
      'codex',
      ['exec'],
      expect.objectContaining({ cwd: expect.any(String) })
    );
  });

  it('rejects path traversal in cwd', async () => {
    const result = await invokeCodex({
      prompt: 'Hello',
      cwd: '/etc/passwd'
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Path traversal');
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('uses heartbeat build target as default cwd when CODEX_CWD is unset', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'invoke-codex-heartbeat-'));
    cleanupDirs.push(baseDir);
    const workspaceRoot = join(baseDir, 'Ernest Agent', 'workspace');
    const targetRoot = join(baseDir, 'ernest-mail');
    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(targetRoot, { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'HEARTBEAT.md'),
      '# HEARTBEAT: Build `ernest-mail`\n',
      'utf8'
    );

    process.env.OPENCLAW_WORKSPACE_ROOT = workspaceRoot;
    process.env.FILE_WORKSPACE_ROOT = workspaceRoot;
    process.env.RISKY_WORKSPACE_MODE = 'true';

    const mockChild: {
      stdout: { on: jest.Mock };
      stderr: { on: jest.Mock };
      on: jest.Mock;
    } = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn()
    };
    mockChild.on.mockImplementation((ev: string, fn: (...args: unknown[]) => void) => {
      if (ev === 'close') setImmediate(() => fn(0, null));
      return mockChild;
    });
    mockedSpawn.mockReturnValue(mockChild as never);
    (mockChild.stdout as { on: jest.Mock }).on.mockImplementation(() => mockChild);
    (mockChild.stderr as { on: jest.Mock }).on.mockImplementation(() => mockChild);

    const result = await invokeCodex({ prompt: 'Use heartbeat target cwd' });

    expect(result.success).toBe(true);
    expect(mockedSpawn).toHaveBeenCalledWith(
      'codex',
      ['exec', '--sandbox', 'workspace-write'],
      expect.objectContaining({ cwd: targetRoot })
    );
  });

  it('uses prompt-derived workspace target when heartbeat target is unavailable', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'invoke-codex-prompt-'));
    cleanupDirs.push(baseDir);
    const workspaceRoot = join(baseDir, 'Ernest Agent', 'workspace');
    const targetRoot = join(baseDir, 'ernest-mail');
    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(targetRoot, { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'HEARTBEAT.md'),
      '# HEARTBEAT: Build `missing-repo`\n',
      'utf8'
    );

    process.env.OPENCLAW_WORKSPACE_ROOT = workspaceRoot;
    process.env.FILE_WORKSPACE_ROOT = workspaceRoot;
    process.env.RISKY_WORKSPACE_MODE = 'true';

    const mockChild: {
      stdout: { on: jest.Mock };
      stderr: { on: jest.Mock };
      on: jest.Mock;
    } = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn()
    };
    mockChild.on.mockImplementation((ev: string, fn: (...args: unknown[]) => void) => {
      if (ev === 'close') setImmediate(() => fn(0, null));
      return mockChild;
    });
    mockedSpawn.mockReturnValue(mockChild as never);
    (mockChild.stdout as { on: jest.Mock }).on.mockImplementation(() => mockChild);
    (mockChild.stderr as { on: jest.Mock }).on.mockImplementation(() => mockChild);

    const result = await invokeCodex({ prompt: 'Continue work in repo ernest-mail and fix tests' });

    expect(result.success).toBe(true);
    expect(mockedSpawn).toHaveBeenCalledWith(
      'codex',
      ['exec', '--sandbox', 'workspace-write'],
      expect.objectContaining({ cwd: targetRoot })
    );
  });

  it('returns spawn error when codex is not found', async () => {
    mockedSpawn.mockImplementation(() => {
      const mockChild: {
        stdout: { on: jest.Mock };
        stderr: { on: jest.Mock };
        on: jest.Mock;
      } = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };
      mockChild.on.mockImplementation((ev: string, fn: (...args: unknown[]) => void) => {
        if (ev === 'error') {
          setImmediate(() => fn(new Error('spawn codex ENOENT')));
        }
        return mockChild;
      });
      return mockChild as never;
    });

    const result = await invokeCodex({
      prompt: 'Summarize this project.'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOENT');
  });

  it('passes sandbox flag when configured', async () => {
    process.env.CODEX_SANDBOX_MODE = 'workspace-write';

    const mockChild: {
      stdout: { on: jest.Mock };
      stderr: { on: jest.Mock };
      on: jest.Mock;
    } = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn()
    };
    mockChild.on.mockImplementation((ev: string, fn: (...args: unknown[]) => void) => {
      if (ev === 'close') setImmediate(() => fn(0, null));
      return mockChild;
    });
    mockedSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
    (mockChild.stdout as { on: jest.Mock }).on.mockImplementation(() => mockChild);
    (mockChild.stderr as { on: jest.Mock }).on.mockImplementation(() => mockChild);

    const result = await invokeCodex({ prompt: 'Check flags' });
    expect(result.success).toBe(true);
    expect(mockedSpawn).toHaveBeenCalledWith(
      'codex',
      ['exec', '--sandbox', 'workspace-write'],
      expect.any(Object)
    );
  });
});
