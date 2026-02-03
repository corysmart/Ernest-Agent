import { assertSafeObject } from './validation';

export interface ToolHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>> | Record<string, unknown>;
}

interface SandboxedToolRunnerOptions {
  tools: Record<string, ToolHandler>;
}

export class SandboxedToolRunner {
  private readonly tools: Record<string, ToolHandler>;

  constructor(options: SandboxedToolRunnerOptions) {
    this.tools = options.tools;
  }

  async run(toolName: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const handler = this.tools[toolName];
    if (!handler) {
      throw new Error('Tool not permitted');
    }

    assertSafeObject(input);

    const result = await handler(input);
    assertSafeObject(result);
    return result;
  }
}
