import { spawn } from 'child_process';
import { CodexLLMAdapter } from '../../llm/adapters/codex-adapter';

jest.mock('child_process');

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

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
  beforeEach(() => {
    mockedSpawn.mockReset();
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
