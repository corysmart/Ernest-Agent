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
});
