import { spawn } from 'child_process';
import { invokeCodex } from '../../tools/invoke-codex';

jest.mock('child_process');

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('invoke_codex', () => {
  beforeEach(() => {
    mockedSpawn.mockReset();
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
});
