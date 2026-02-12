/**
 * Integration test: full TUI flow with mocked inquirer.
 * Verifies Send follow-up appears and works after a dry run with clarifying question.
 */

import { buildServer } from '../../server/server';
import { main } from '../../cli/agent-tui';

// Mock inquirer before agent-tui uses it
const mockSelect = jest.fn();
const mockInput = jest.fn();
const mockConfirm = jest.fn();

jest.mock('@inquirer/prompts', () => ({
  input: (opts: { message?: string }) => mockInput(opts),
  select: (opts: { message?: string; choices?: Array<{ value: string }> }) => mockSelect(opts),
  confirm: (opts: { message?: string }) => mockConfirm(opts)
}));

describe('agent-tui integration: follow-up flow', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let baseUrl: string;
  let originalFetch: typeof globalThis.fetch;
  const runOnceBodies: unknown[] = [];

  beforeAll(async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.MOCK_LLM_RESPONSE = '{"actionType":"pursue_goal","actionPayload":{"response":"I need details: which file and error?"},"confidence":0.85}';
    server = await buildServer({ logger: false });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
    process.env.AGENT_URL = baseUrl;
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.includes('/agent/run-once') && init?.body) {
        runOnceBodies.push(JSON.parse(init.body as string));
      }
      return originalFetch(input as Parameters<typeof originalFetch>[0], init);
    };
  });

  afterAll(async () => {
    await server?.close();
    delete process.env.AGENT_URL;
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    runOnceBodies.length = 0;
    jest.clearAllMocks();
    mockSelect.mockReset();
    mockInput.mockReset();
    mockConfirm.mockReset();
  });

  it('shows Send follow-up after dry run, sends conversation_history on follow-up', async () => {
    let selectCallCount = 0;
    let inputCallCount = 0;
    let confirmCallCount = 0;

    mockSelect.mockImplementation((opts: { choices?: Array<{ value: string }> }) => {
      selectCallCount += 1;
      const choices = opts.choices ?? [];
      // 1st: dry-with-llm, 2nd: follow-up (must be available), 3rd: exit
      if (selectCallCount === 1) return Promise.resolve('dry-with-llm');
      if (selectCallCount === 2) {
        const hasFollowUp = choices.some((c: { value: string }) => c.value === 'follow-up');
        expect(hasFollowUp).toBe(true);
        return Promise.resolve('follow-up');
      }
      return Promise.resolve('exit');
    });

    mockInput.mockImplementation(() => {
      inputCallCount += 1;
      // 1: user message "Fix the bug", 2: press enter, 3: follow-up "main.ts", 4: press enter
      if (inputCallCount === 1) return Promise.resolve('Fix the bug');
      if (inputCallCount === 2) return Promise.resolve('');
      if (inputCallCount === 3) return Promise.resolve('main.ts');
      return Promise.resolve('');
    });

    mockConfirm.mockResolvedValue(false); // No explicit goal

    const mainPromise = main();

    await expect(mainPromise).resolves.toBeUndefined();

    expect(mockSelect).toHaveBeenCalledTimes(3);
    expect(mockInput).toHaveBeenCalledTimes(4);
    expect(runOnceBodies).toHaveLength(2);

    const firstRun = runOnceBodies[0] as { observation?: { conversation_history?: unknown[] } };
    const secondRun = runOnceBodies[1] as { observation?: { conversation_history?: unknown[]; state?: { user_message?: string } } };
    expect(firstRun.observation?.conversation_history).toBeUndefined();
    expect(secondRun.observation?.conversation_history).toHaveLength(2);
    expect(secondRun.observation?.conversation_history?.[0]).toEqual({ role: 'user', content: 'Fix the bug' });
    expect(secondRun.observation?.conversation_history?.[1]).toMatchObject({ role: 'assistant', content: expect.stringContaining('I need details') });
    expect(secondRun.observation?.state?.user_message).toBe('main.ts');
  });
});
