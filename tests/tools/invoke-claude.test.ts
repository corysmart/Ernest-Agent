import { spawn } from 'child_process';
import { invokeClaude } from '../../tools/invoke-claude';

jest.mock('child_process');

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('invoke_claude', () => {
  beforeEach(() => {
    mockedSpawn.mockReset();
  });

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
      ['Create a Python script that prints Hello.'],
      expect.objectContaining({
        cwd: process.cwd(),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    );
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
      ['--system-prompt', 'You are a concise coding assistant.', 'Review this pull request'],
      expect.any(Object)
    );
  });

  it('spawns claude with promptFile', async () => {
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
      promptFile: './prompts/style-rules.txt'
    });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      ['-p', './prompts/style-rules.txt'],
      expect.any(Object)
    );
  });

  it('spawns claude with promptFile and prompt', async () => {
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
      promptFile: './prompts/style-rules.txt',
      prompt: 'Review this pull request'
    });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      ['-p', './prompts/style-rules.txt', 'Review this pull request'],
      expect.any(Object)
    );
  });

  it('accepts system_prompt and prompt_file as snake_case', async () => {
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
      prompt_file: './p.txt'
    });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      ['--system-prompt', 'Be brief', '-p', './p.txt', 'Hello'],
      expect.any(Object)
    );
  });

  it('uses cwd when provided', async () => {
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
      cwd: '/projects/my-app'
    });

    expect(result.success).toBe(true);
    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      ['Fix bugs.'],
      expect.objectContaining({ cwd: '/projects/my-app' })
    );
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
