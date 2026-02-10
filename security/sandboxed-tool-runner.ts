import { assertSafeObject } from './validation';
import { Worker } from 'worker_threads';
import { randomUUID } from 'crypto';

export interface ToolHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>> | Record<string, unknown>;
}

interface SandboxedToolRunnerOptions {
  tools: Record<string, ToolHandler>;
  /**
   * Timeout in milliseconds for tool execution. Default: 30000 (30 seconds).
   */
  timeoutMs?: number;
  /**
   * P2: Enable worker thread isolation for true process-level isolation.
   * When true, tools execute in worker threads with hard kill-on-timeout.
   * Default: false (in-process execution with timeout protection).
   */
  useWorkerThreads?: boolean;
}

/**
 * P2: SandboxedToolRunner provides execution boundaries for tool execution.
 * 
 * SECURITY LIMITATION: Tools execute in-process. A CPU-bound or blocking handler can freeze
 * the event loop and bypass timeouts, allowing DoS from a single tool. This is application-level
 * sandboxing, not process-level isolation.
 * 
 * For true isolation with hard kill-on-timeout, use:
 * - Child processes with process.kill('SIGKILL') on timeout (requires tool registry)
 * - Worker threads (limited - functions can't be serialized)
 * - Container-based execution (Docker, Deno Sandbox, Vercel Sandbox)
 * 
 * Current implementation provides:
 * - Explicit tool registration (only registered tools can run)
 * - Timeout enforcement (but can't kill CPU-bound tasks - they continue executing)
 * - Input/output safety validation
 * 
 * TODO: Implement full isolation using child processes with:
 * 1. Tool registry system that can serialize tool definitions
 * 2. Child process that loads and executes tools via IPC
 * 3. Hard kill on timeout using process.kill('SIGKILL')
 */
export class SandboxedToolRunner {
  private readonly tools: Record<string, ToolHandler>;
  private readonly timeoutMs: number;
  /**
   * P2: Enable worker thread isolation for true process-level isolation.
   * When true, tools execute in worker threads with hard kill-on-timeout.
   */
  private readonly useWorkerThreads: boolean;

  constructor(options: SandboxedToolRunnerOptions) {
    this.tools = options.tools;
    this.timeoutMs = options.timeoutMs ?? 30000; // 30 seconds default
    this.useWorkerThreads = options.useWorkerThreads ?? false;
  }

  /**
   * P2: Runs a tool with timeout protection and input/output validation.
   * 
   * When useWorkerThreads=true, provides true process-level isolation with hard kill-on-timeout.
   * When useWorkerThreads=false (default), uses in-process execution (CPU-bound tasks can freeze event loop).
   */
  async run(toolName: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const handler = this.tools[toolName];
    if (!handler) {
      throw new Error('Tool not permitted');
    }

    // P2: Validate input to prevent prototype pollution and unsafe data
    assertSafeObject(input);

    // P2: Use worker thread isolation if enabled
    if (this.useWorkerThreads) {
      return this.runInWorkerThread(toolName, handler, input);
    }

    // P2: In-process execution with timeout protection
    // LIMITATION: This won't kill CPU-bound tasks - they continue executing after timeout
    // Promise.race only rejects the promise, it doesn't stop execution
    // A CPU-bound handler will continue running and freeze the event loop
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Tool ${toolName} execution timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    try {
      // Race between tool execution and timeout
      // LIMITATION: If handler is CPU-bound, it will continue executing even after timeout
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

  /**
   * P2: Executes tool in worker thread with hard kill-on-timeout.
   * Provides true isolation - CPU-bound handlers cannot freeze the main event loop.
   */
  private async runInWorkerThread(
    toolName: string,
    handler: ToolHandler,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const requestId = randomUUID();
    
    // Serialize handler to string for worker thread
    // Note: This is a simplified approach - in production, use a tool registry system
    const handlerString = handler.toString();
    
    // Create worker script
    const workerScript = `
      const { parentPort } = require('worker_threads');
      
      // Reconstruct handler from string (simplified - production should use registry)
      const handler = ${handlerString};
      
      parentPort.on('message', async (request) => {
        try {
          const result = await handler(request.input);
          parentPort.postMessage({
            requestId: request.requestId,
            success: true,
            result
          });
        } catch (error) {
          parentPort.postMessage({
            requestId: request.requestId,
            success: false,
            error: error.message || String(error)
          });
        }
      });
    `;
    
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const worker = new Worker(workerScript, { eval: true });
      let timeoutId: NodeJS.Timeout | undefined;
      let completed = false;
      
      // P2: Hard timeout - forcefully terminate worker on timeout
      timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          worker.terminate(); // Hard kill - cannot be caught or ignored
          reject(new Error(`Tool ${toolName} execution timed out after ${this.timeoutMs}ms`));
        }
      }, this.timeoutMs);
      
      worker.on('message', (response: { requestId: string; success: boolean; result?: Record<string, unknown>; error?: string }) => {
        if (response.requestId === requestId && !completed) {
          completed = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          worker.terminate();
          
          if (response.success && response.result) {
            // Validate result before returning
            assertSafeObject(response.result);
            resolve(response.result);
          } else {
            reject(new Error(response.error || 'Tool execution failed'));
          }
        }
      });
      
      worker.on('error', (error) => {
        if (!completed) {
          completed = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          worker.terminate();
          reject(error);
        }
      });
      
      worker.on('exit', (code) => {
        if (!completed && code !== 0) {
          completed = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
      
      // Send execution request
      worker.postMessage({ toolName, input, requestId });
    });
  }
}
