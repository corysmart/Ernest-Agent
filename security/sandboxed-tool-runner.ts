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

/**
 * P2: SandboxedToolRunner provides execution boundaries for tool execution.
 * 
 * "Sandboxing" in this context means:
 * - Only registered tools can execute (no arbitrary code execution)
 * - Timeout protection to prevent hanging tools
 * - Input/output validation to prevent unsafe data
 * 
 * NOTE: This is NOT process-level isolation. Tools still run in the same Node.js process
 * and can access the runtime, filesystem, and network. For true isolation, consider:
 * - Worker threads for CPU-bound tasks
 * - Child processes for complete isolation
 * - Container-based execution (Docker, etc.)
 * 
 * The current implementation provides application-level sandboxing through:
 * - Explicit tool registration (only registered tools can run)
 * - Timeout enforcement
 * - Input/output safety validation
 */
export class SandboxedToolRunner {
  private readonly tools: Record<string, ToolHandler>;
  private readonly timeoutMs: number;

  constructor(options: SandboxedToolRunnerOptions) {
    this.tools = options.tools;
    this.timeoutMs = options.timeoutMs ?? 30000; // 30 seconds default
  }

  /**
   * P2: Runs a tool with timeout protection and input/output validation.
   * Provides application-level sandboxing (not process-level isolation).
   */
  async run(toolName: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const handler = this.tools[toolName];
    if (!handler) {
      throw new Error('Tool not permitted');
    }

    // P2: Validate input to prevent prototype pollution and unsafe data
    assertSafeObject(input);

    // Wrap tool execution in a timeout promise
    // Store timeout ID so we can clear it if the tool completes before timeout
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Tool ${toolName} execution timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    try {
      // Race between tool execution and timeout
      const result = await Promise.race([
        handler(input),
        timeoutPromise
      ]);

      // Clear timeout if tool completed successfully
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      assertSafeObject(result);
      return result;
    } catch (error) {
      // Clear timeout on error as well
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      throw error;
    }
  }
}
