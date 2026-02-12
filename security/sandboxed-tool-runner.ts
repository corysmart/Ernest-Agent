import { assertSafeObject } from './validation';
import { Worker } from 'worker_threads';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { existsSync } from 'fs';
import { toolRegistry } from '../tools/registry';

/**
 * P3: Validates that a value is structured-clone compatible (can be sent via postMessage).
 * Rejects functions, symbols, and other non-serializable values that would cause DataCloneError.
 */
function assertStructuredCloneCompatible(value: unknown, path = 'root'): void {
  if (value === null || value === undefined) {
    return;
  }

  const type = typeof value;
  
  // Primitive types are always cloneable
  if (type === 'boolean' || type === 'number' || type === 'string') {
    return;
  }

  // Functions and symbols cannot be cloned
  if (type === 'function') {
    throw new Error(`Value at ${path} contains a function, which cannot be cloned for worker thread communication`);
  }
  
  if (type === 'symbol') {
    throw new Error(`Value at ${path} contains a symbol, which cannot be cloned for worker thread communication`);
  }

  // BigInt cannot be cloned
  if (type === 'bigint') {
    throw new Error(`Value at ${path} contains a BigInt, which cannot be cloned for worker thread communication`);
  }

  // Objects and arrays need recursive validation
  if (type === 'object') {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        assertStructuredCloneCompatible(item, `${path}[${index}]`);
      });
    } else {
      // P3: Check all properties including non-enumerable and symbol keys
      // for...in only sees enumerable string keys, which can miss non-cloneable values
      // Use Object.getOwnPropertyNames() for all string keys (enumerable and non-enumerable)
      // and Object.getOwnPropertySymbols() for symbol keys
      const obj = value as Record<string | symbol, unknown>;
      
      // Check all string keys (enumerable and non-enumerable)
      const stringKeys = Object.getOwnPropertyNames(obj);
      for (const key of stringKeys) {
        assertStructuredCloneCompatible(obj[key], `${path}.${String(key)}`);
      }
      
      // Check all symbol keys
      const symbolKeys = Object.getOwnPropertySymbols(obj);
      for (const key of symbolKeys) {
        assertStructuredCloneCompatible(obj[key], `${path}[Symbol(${key.description || 'unnamed'})]`);
      }
    }
  }
}

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
  /**
   * P2: Require worker thread isolation (fail if serialization fails).
   * When true, throws an error if handler cannot be serialized instead of falling back.
   * Should be true in production when isolation is required for security.
   */
  requireIsolation?: boolean;
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
  /**
   * P2: Require worker thread isolation (fail if serialization fails).
   * When true, throws an error if handler cannot be serialized instead of falling back.
   */
  private readonly requireIsolation: boolean;

  constructor(options: SandboxedToolRunnerOptions) {
    this.tools = options.tools;
    this.timeoutMs = options.timeoutMs ?? 30000; // 30 seconds default
    this.useWorkerThreads = options.useWorkerThreads ?? false;
    this.requireIsolation = options.requireIsolation ?? false;
    
    // P2: Enforce requireIsolation flag - if isolation is required, worker threads must be enabled
    // This prevents false sense of security where requireIsolation=true but tools still run in-process
    if (this.requireIsolation && !this.useWorkerThreads) {
      throw new Error(
        'requireIsolation=true requires useWorkerThreads=true. ' +
        'Worker thread isolation is required for security, but useWorkerThreads is false. ' +
        'Set useWorkerThreads=true to enable process-level isolation, or set requireIsolation=false if in-process execution is acceptable.'
      );
    }
  }

  /**
   * P2: Runs a tool with timeout protection and input/output validation.
   * 
   * When useWorkerThreads=true, provides true process-level isolation with hard kill-on-timeout.
   * When useWorkerThreads=false (default), uses in-process execution (CPU-bound tasks can freeze event loop).
   */
  /**
   * P2: Runs a tool with timeout protection and input/output validation.
   * 
   * When useWorkerThreads=true, provides true process-level isolation with hard kill-on-timeout.
   * When useWorkerThreads=false (default), uses in-process execution (CPU-bound tasks can freeze event loop).
   * 
   * P2: Tools are loaded from the module-based registry. For worker threads, tools are loaded
   * in the worker via static imports. For in-process execution, tools are retrieved from the registry.
   */
  async run(toolName: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    // P2: Validate input to prevent prototype pollution and unsafe data
    assertSafeObject(input);

    // P2: When worker threads are enabled, tools must be in registry (not constructor tools)
    // Reject earlier with a clearer error to avoid confusing mismatch
    if (this.useWorkerThreads) {
      if (!toolRegistry.has(toolName)) {
        throw new Error(
          `Tool ${toolName} is not registered in the tool registry. ` +
          `When useWorkerThreads=true, all tools must be registered via initializeToolRegistry() ` +
          `at startup. Constructor-provided tools are not supported in worker threads for security.`
        );
      }
    }

    // P2: Get handler from registry (module-based, no eval) or constructor (for in-process only)
    // P3: In in-process mode, prefer constructor tools to allow test overrides
    // In worker thread mode, only registry tools are supported
    const handler = this.useWorkerThreads
      ? toolRegistry.get(toolName) // Worker threads: only registry tools
      : (this.tools[toolName] ?? toolRegistry.get(toolName)); // In-process: constructor tools can override registry
    
    if (!handler) {
      throw new Error(`Tool ${toolName} not permitted or not found in registry`);
    }

    // P2: Use worker thread isolation if enabled
    if (this.useWorkerThreads) {
      return this.runInWorkerThread(toolName, handler, input);
    }

    // P2: In-process execution with timeout protection
    return this.runInProcess(toolName, handler, input);
  }

  /**
   * P2: In-process execution with timeout protection.
   * LIMITATION: This won't kill CPU-bound tasks - they continue executing after timeout.
   * Promise.race only rejects the promise, it doesn't stop execution.
   * A CPU-bound handler will continue running and freeze the event loop.
   */
  private async runInProcess(
    toolName: string,
    handler: ToolHandler,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const inputWithSignal = { ...input, __abortSignal: controller.signal };

    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error(`Tool ${toolName} execution timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([
        handler(inputWithSignal),
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
   * 
   * P2: Uses module-based tool registry - no eval or handler.toString() serialization.
   * Tools are loaded from static imports in the worker thread.
   */
  private async runInWorkerThread(
    toolName: string,
    handler: ToolHandler,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const requestId = randomUUID();
    
    // P2: Tool existence is already verified in run() before calling this method
    // This check is redundant but kept for safety
    if (!toolRegistry.has(toolName)) {
      throw new Error(`Tool ${toolName} is not registered in the tool registry. ` +
        `All tools must be registered at startup via initializeToolRegistry().`);
    }
    
    // P2: Use module-based worker script - no eval, no handler serialization
    // Worker script imports the tool registry and calls tools by name
    // P3: Node.js Worker cannot execute .ts files directly - requires compiled .js
    // Error clearly if .js file doesn't exist, instructing to build first
    const workerScriptPath = join(__dirname, 'tool-worker.js');
    
    if (!existsSync(workerScriptPath)) {
      throw new Error(
        `Worker script not found: ${workerScriptPath}. ` +
        `The tool-worker.js file must exist for worker thread execution. ` +
        `If running in dev/test, run 'npm run build' first to compile TypeScript files. ` +
        `Node.js Worker cannot execute .ts files directly without a TypeScript loader.`
      );
    }
    
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const worker = new Worker(workerScriptPath);
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
      
      // P3: Validate input is structured-clone compatible before postMessage
      // assertSafeObject doesn't reject functions/symbols, but postMessage requires structured-clone compatibility
      // This prevents DataCloneError that would be hard to diagnose
      try {
        assertStructuredCloneCompatible(input, 'input');
      } catch (error) {
        completed = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        worker.terminate();
        reject(new Error(`Tool ${toolName} input contains non-serializable values: ${error instanceof Error ? error.message : String(error)}`));
        return;
      }

      // Send execution request with tool name and input
      // Worker will look up tool in registry and execute it
      worker.postMessage({ toolName, input, requestId });
    });
  }
}
