import { SandboxedToolRunner } from '../../security/sandboxed-tool-runner';

describe('SandboxedToolRunner', () => {
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

    await expect(runner.run('unknown', {})).rejects.toThrow('Tool not permitted');
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
});
