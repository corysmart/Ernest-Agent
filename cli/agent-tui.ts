/**
 * Terminal UI for connecting to the Ernest agent server.
 * Provides an interactive interface for all run-once operations.
 */

/* eslint-disable no-await-in-loop */

import { input, select, confirm } from '@inquirer/prompts';
import { extractAssistantContent, formatResult, type RunOnceResponse } from './agent-tui-helpers';

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = process.env.AGENT_URL ?? `http://127.0.0.1:${PORT}`;
const API_KEY = process.env.API_KEY ?? process.env.AGENT_API_KEY;

/** Max ms for run-once request. Default 10 min. Set RUN_ONCE_TIMEOUT_MS to override. */
const REQUEST_TIMEOUT_MS = (() => {
  const raw = Number(process.env.RUN_ONCE_TIMEOUT_MS ?? 600_000);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 600_000;
})();

type RunMode = 'run' | 'dry-with-llm' | 'dry-without-llm';

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface RunOnceRequest {
  observation: {
    state: Record<string, unknown>;
    timestamp?: number;
    events?: string[];
    conversation_history?: ConversationEntry[];
  };
  goal?: { id: string; title: string; description?: string; priority?: number; horizon?: string };
  dryRun?: 'with-llm' | 'without-llm';
  autoRespond?: boolean;
}

function getBaseUrl(): string {
  return process.env.AGENT_URL ?? BASE_URL;
}

async function fetchApi(path: string, options?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>)
  };
  if (API_KEY) {
    headers.Authorization = `ApiKey ${API_KEY}`;
  }
  return fetch(`${getBaseUrl()}${path}`, { ...options, headers });
}

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetchApi('/health');
    if (res.ok) {
      const data = await res.json();
      console.log('\n✓ Server healthy:', JSON.stringify(data, null, 2));
      return true;
    }
  } catch (err) {
    console.error('\n✗ Connection failed:', err instanceof Error ? err.message : String(err));
  }
  return false;
}

async function runOnce(payload: RunOnceRequest): Promise<RunOnceResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchApi('/agent/run-once', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return JSON.parse(text) as RunOnceResponse;
}

async function promptForRun(mode: RunMode): Promise<RunOnceRequest> {
  const userMessage = await input({
    message: 'User message (observation)',
    default: 'Summarize the current state',
    validate: (v: string) => (v.trim() ? true : 'Required')
  });

  const withGoal = await confirm({
    message: 'Add an explicit goal?',
    default: true
  });

  let goal: RunOnceRequest['goal'] | undefined;
  if (withGoal) {
    const goalTitle = await input({
      message: 'Goal title',
      default: 'Summarize'
    });
    const goalDescription = await input({
      message: 'Goal description (optional)',
      default: ''
    });
    goal = {
      id: `g-${Date.now()}`,
      title: goalTitle.trim() || 'Summarize',
      description: goalDescription.trim() || undefined,
      priority: 1,
      horizon: 'short'
    };
  }

  const payload: RunOnceRequest = {
    observation: {
      state: { user_message: userMessage.trim() },
      timestamp: Date.now()
    },
    goal
  };

  if (mode === 'dry-with-llm') payload.dryRun = 'with-llm';
  else if (mode === 'dry-without-llm') payload.dryRun = 'without-llm';

  return payload;
}

export async function main(): Promise<void> {
  type LastExchange = {
    conversationHistory: ConversationEntry[];
    mode: RunMode;
    goal: RunOnceRequest['goal'];
  };
  let lastExchange: LastExchange | null = null;
  console.log(`\nErnest Agent TUI — ${getBaseUrl()}\n`);

  const healthy = await checkHealth();
  if (!healthy) {
    console.log('\nStart the server with: npm run dev');
    console.log('Or set AGENT_URL for a different endpoint.\n');
    process.exit(1);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const choices: Array<{ name: string; value: string }> = [
      ...(lastExchange ? [{ name: 'Send follow-up', value: 'follow-up' }] : []),
      { name: 'Run agent', value: 'run' },
      { name: 'Dry run (with LLM)', value: 'dry-with-llm' },
      { name: 'Dry run (without LLM)', value: 'dry-without-llm' },
      { name: 'Health check', value: 'health' },
      { name: 'Exit', value: 'exit' }
    ];

    const action = await select({
      message: lastExchange ? 'Continue the conversation or choose another action:' : 'Choose an operation',
      choices,
      default: lastExchange ? 'follow-up' : undefined
    });

    if (action === 'exit') {
      console.log('\nGoodbye.\n');
      break;
    }

    if (action === 'health') {
      await checkHealth();
      continue;
    }

    try {
      let payload: RunOnceRequest;
      if (action === 'follow-up' && lastExchange) {
        const followUp = await input({
          message: 'Your follow-up message',
          validate: (v: string) => (v.trim() ? true : 'Required')
        });
        payload = {
          observation: {
            state: { user_message: followUp.trim() },
            timestamp: Date.now(),
            conversation_history: lastExchange.conversationHistory
          },
          goal: lastExchange.goal
        };
        if (lastExchange.mode === 'dry-with-llm') payload.dryRun = 'with-llm';
        else if (lastExchange.mode === 'dry-without-llm') payload.dryRun = 'without-llm';
      } else {
        payload = await promptForRun(action as RunMode);
      }

      let result: RunOnceResponse;
      let succeeded = false;
      for (;;) {
        const startMs = Date.now();
        const progressInterval = setInterval(() => {
          const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
          const remainingSec = Math.max(0, Math.floor(REQUEST_TIMEOUT_MS / 1000) - elapsedSec);
          const remainingStr = remainingSec >= 60 ? `~${Math.ceil(remainingSec / 60)} min left` : `${remainingSec}s left`;
          process.stdout.write(
            `\r\x1b[KRunning... ${elapsedSec}s (${remainingStr}) — ${getBaseUrl().replace('127.0.0.1', 'localhost')}/ui\x1b[0m`
          );
        }, 1000);
        try {
          result = await runOnce(payload);
          clearInterval(progressInterval);
          process.stdout.write('\r\x1b[K');
          console.log(formatResult(result));
          if (result.status !== 'error') {
            succeeded = true;
            break;
          }
          const shouldRetry = await confirm({
            message: 'Agent reported an error. Retry this request?',
            default: true
          });
          if (!shouldRetry) break;
          console.log('\nRetrying...');
        } catch (err) {
          clearInterval(progressInterval);
          process.stdout.write('\r\x1b[K');
          console.error('\n✗ Request failed:', err instanceof Error ? err.message : String(err));
          const shouldRetry = await confirm({
            message: 'Retry this request?',
            default: true
          });
          if (!shouldRetry) throw err;
          console.log('\nRetrying...');
        }
      }

      if (succeeded && result!) {
        const userMsg = (payload.observation.state?.user_message as string) || '';
        const assistantContent = extractAssistantContent(result);
        const mode = (payload.dryRun === 'with-llm' ? 'dry-with-llm' : payload.dryRun === 'without-llm' ? 'dry-without-llm' : 'run') as RunMode;
        const prevHistory: ConversationEntry[] = action === 'follow-up' && lastExchange ? lastExchange.conversationHistory : [];
        lastExchange = {
          conversationHistory: [
            ...prevHistory,
            { role: 'user' as const, content: userMsg },
            { role: 'assistant' as const, content: assistantContent }
          ],
          mode,
          goal: payload.goal
        };
      }

      await input({ message: 'Press Enter to continue', default: '' });
    } catch (err) {
      console.error('\n✗ Request failed:', err instanceof Error ? err.message : String(err));
    }
  }
}

if (require.main === module) {
  main();
}
