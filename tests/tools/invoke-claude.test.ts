import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, rmdirSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { invokeClaude } from '../../tools/invoke-claude';

jest.mock('child_process');

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('invoke_claude', () => {
  let tmpDir: string;

  beforeEach(() => {
    mockedSpawn.mockReset();
    tmpDir = mkdtempSync(join(tmpdir(), 'claude-test-'));
  });

  afterEach(() => {
    try {
      rmdirSync(tmpDir, { recursive: true });
    } catch {
      /* ignore */
    }
  });

  /** Path inside workspace for promptFile tests (assertSafePath requires cwd containment). */
  function workspacePath(filename: string): string {
    const dir = join(process.cwd(), 'tests', 'fixtures');
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
    return join(dir, filename);
  }

  it('returns error when neither prompt nor promptFile is provided', async () => {
    const result = await invokeClaude({});
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('prompt or promptFile')
    });
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('returns error when prompt is empty string', async () => {
    const result = await invokeClaude({ prompt: '   ' });
    expect(result.success).toBe(false);
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('spawns claude with prompt only', async () => {
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

    const result = await invokeClaude({
      prompt: 'Create a Python script that prints Hello.'
    });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining([expect.stringMatching(/\.txt$/)]),
      expect.objectContaining({
        cwd: process.cwd(),
        shell: false
      })
    );
    expect(mockedSpawn.mock.calls[0]![1]).toContain('-p');
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('spawns claude with systemPrompt and prompt', async () => {
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

    await invokeClaude({
      prompt: 'Review this pull request',
      systemPrompt: 'You are a concise coding assistant.'
    });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--system-prompt-file', expect.any(String), '-p', expect.any(String)]),
      expect.any(Object)
    );
  });

  it('spawns claude with promptFile', async () => {
    const promptFilePath = workspacePath('style-rules-test.txt');
    writeFileSync(promptFilePath, 'Be concise.', 'utf8');

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

    await invokeClaude({
      promptFile: promptFilePath
    });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['-p', expect.any(String)]),
      expect.any(Object)
    );
  });

  it('spawns claude with promptFile and prompt (combined)', async () => {
    const promptFilePath = workspacePath('rules-combined-test.txt');
    writeFileSync(promptFilePath, 'Style rules.', 'utf8');

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

    await invokeClaude({
      promptFile: promptFilePath,
      prompt: 'Review this pull request'
    });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['-p', expect.any(String)]),
      expect.any(Object)
    );

    try {
      unlinkSync(promptFilePath);
    } catch {
      /* ignore */
    }
  });

  it('accepts system_prompt and prompt_file as snake_case', async () => {
    const pPath = workspacePath('snake-case-test.txt');
    writeFileSync(pPath, 'From file', 'utf8');

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

    await invokeClaude({
      prompt: 'Hello',
      system_prompt: 'Be brief',
      prompt_file: pPath
    });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--system-prompt-file', expect.any(String), '-p', expect.any(String)]),
      expect.any(Object)
    );

    try {
      unlinkSync(pPath);
    } catch {
      /* ignore */
    }
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

    const result = await invokeClaude({
      prompt: 'Fix bugs.',
      cwd: '.'
    });

    expect(result.success).toBe(true);
    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({ cwd: expect.any(String) })
    );
  });

  it('rejects path traversal in cwd', async () => {
    const result = await invokeClaude({
      prompt: 'Hello',
      cwd: '/etc'
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Path traversal');
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('rejects path traversal in promptFile', async () => {
    const result = await invokeClaude({
      promptFile: '/etc/passwd'
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Path traversal');
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('returns spawn error when claude is not found', async () => {
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
          setImmediate(() => fn(new Error('spawn claude ENOENT')));
        }
        return mockChild;
      });
      return mockChild as never;
    });

    const result = await invokeClaude({ prompt: 'Hello' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOENT');
  });
});
