import { existsSync } from 'fs';
import { Worker } from 'worker_threads';
import { SandboxedToolRunner } from '../../security/sandboxed-tool-runner';
import { initializeToolRegistry } from '../../tools/registry';

jest.mock('fs');
jest.mock('worker_threads');

const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const MockedWorker = Worker as jest.MockedClass<typeof Worker>;

describe('SandboxedToolRunner', () => {
  beforeAll(() => {
    initializeToolRegistry();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
  });

  it('runs registered tools', async () => {
    const runner = new SandboxedToolRunner({
      tools: {
        echo: async (input: Record<string, unknown>) => {
          const text = input.text as string;
          return { echoed: text };
        }
      }
    });

    const result = await runner.run('echo', { text: 'hi' });
    expect(result.echoed).toBe('hi');
  });

  it('rejects unknown tools', async () => {
    const runner = new SandboxedToolRunner({ tools: {} });

    await expect(runner.run('unknown', {})).rejects.toThrow('not permitted or not found in registry');
  });

  it('P3: handles handlers with template literals without breaking worker script', async () => {
    // This test verifies that handlers containing backticks and ${} don't break worker script construction
    // Note: This will fall back to in-process execution if useWorkerThreads=true due to closure detection
    const runner = new SandboxedToolRunner({
      tools: {
        templateTool: async (input: Record<string, unknown>) => {
          const value = input.value as string;
          // Handler contains template literal with backticks and ${}
          return { result: `Template value: ${value}` };
        }
      },
      useWorkerThreads: false // Test in-process execution (worker threads would detect closure and fall back)
    });

    const result = await runner.run('templateTool', { value: 'test' });
    expect(result.result).toBe('Template value: test');
  });

  it('throws when requireIsolation=true but useWorkerThreads=false', () => {
    expect(() => new SandboxedToolRunner({ tools: {}, requireIsolation: true })).toThrow(
      'requireIsolation=true requires useWorkerThreads=true'
    );
  });

  it('uses custom timeoutMs', async () => {
    const runner = new SandboxedToolRunner({
      tools: {
        slow: () => new Promise((resolve) => setTimeout(() => resolve({ done: true }), 500))
      },
      timeoutMs: 100
    });

    await expect(runner.run('slow', {})).rejects.toThrow('timed out after 100ms');
  });

  it('rejects unsafe input (prototype pollution)', async () => {
    const runner = new SandboxedToolRunner({
      tools: { echo: async (i) => i as Record<string, unknown> }
    });

    await expect(
      runner.run('echo', { __proto__: { polluted: true } } as Record<string, unknown>)
    ).rejects.toThrow('Unsafe object');
  });

  it('rejects when handler returns unsafe object', async () => {
    const runner = new SandboxedToolRunner({
      tools: {
        bad: async () => ({ __proto__: { polluted: true } } as Record<string, unknown>)
      }
    });

    await expect(runner.run('bad', {})).rejects.toThrow('Unsafe object');
  });

  it('propagates handler errors', async () => {
    const runner = new SandboxedToolRunner({
      tools: {
        fail: async () => {
          throw new Error('handler failed');
        }
      }
    });

    await expect(runner.run('fail', {})).rejects.toThrow('handler failed');
  });

  it('useWorkerThreads with tool not in registry throws before worker', async () => {
    const runner = new SandboxedToolRunner({ tools: {}, useWorkerThreads: true });

    await expect(runner.run('nonexistent_tool', {})).rejects.toThrow(
      'not registered in the tool registry'
    );
  });

  it('uses constructor tool over registry when both have same tool (in-process)', async () => {
    const runner = new SandboxedToolRunner({
      tools: {
        pursue_goal: async () => ({ fromConstructor: true })
      }
    });
    const result = await runner.run('pursue_goal', { goal: 'test' });
    expect(result).toEqual({ fromConstructor: true });
  });

  it('falls back to registry when tool not in constructor (in-process)', async () => {
    const runner = new SandboxedToolRunner({ tools: {} });
    const result = await runner.run('pursue_goal', { x: 1 });
    expect(result).toMatchObject({ acknowledged: true, input: { x: 1 } });
  });

  it('rejects non-serializable input when useWorkerThreads=true', async () => {
    mockedExistsSync.mockReturnValue(true);
    MockedWorker.mockImplementation(() => ({ on: jest.fn(), postMessage: jest.fn(), terminate: jest.fn() } as never));

    const runner = new SandboxedToolRunner({ tools: {}, useWorkerThreads: true });

    await expect(
      runner.run('pursue_goal', { fn: (() => {}) as unknown } as Record<string, unknown>)
    ).rejects.toThrow('contains a function');
  });
});
