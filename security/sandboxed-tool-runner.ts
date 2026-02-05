import { assertSafeObject } from './validation';

export interface ToolHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>> | Record<string, unknown>;
}

interface SandboxedToolRunnerOptions {
  tools: Record<string, ToolHandler>;
  /**
   * Timeout in milliseconds for tool execution. Default: 30000 (30 seconds).
   */
  timeoutMs?: number;
}

export class SandboxedToolRunner {
  private readonly tools: Record<string, ToolHandler>;
  private readonly timeoutMs: number;

  constructor(options: SandboxedToolRunnerOptions) {
    this.tools = options.tools;
    this.timeoutMs = options.timeoutMs ?? 30000; // 30 seconds default
  }

  /**
   * P2: Runs a tool with timeout protection to prevent hanging tools from stalling the agent loop.
   */
  async run(toolName: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const handler = this.tools[toolName];
    if (!handler) {
      throw new Error('Tool not permitted');
    }

    assertSafeObject(input);

    // Wrap tool execution in a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool ${toolName} execution timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    // Race between tool execution and timeout
    const result = await Promise.race([
      handler(input),
      timeoutPromise
    ]);

    assertSafeObject(result);
    return result;
  }
}
