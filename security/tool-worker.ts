/**
 * P2: Worker thread implementation for tool execution isolation.
 * Provides process-level isolation with hard kill-on-timeout semantics.
 */

import { Worker } from 'worker_threads';
import { randomUUID } from 'crypto';

export interface ToolExecutionRequest {
  toolName: string;
  input: Record<string, unknown>;
  requestId: string;
}

export interface ToolExecutionResponse {
  requestId: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * P2: Executes a tool in a worker thread with hard kill-on-timeout.
 * 
 * This provides true isolation - CPU-bound or blocking handlers cannot freeze the event loop.
 * The worker thread can be forcefully terminated on timeout using worker.terminate().
 */
export async function runToolInWorker(
  toolCode: string,
  toolName: string,
  input: Record<string, unknown>,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const requestId = randomUUID();
  
  // Create worker script that executes the tool
  const workerScript = `
    const { parentPort } = require('worker_threads');
    
    // Tool handler function (injected as string)
    ${toolCode}
    
    parentPort.on('message', async (request) => {
      try {
        const handler = ${toolName};
        if (typeof handler !== 'function') {
          throw new Error('Tool handler not found');
        }
        
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
        reject(new Error(`Tool ${toolName} execution timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    
    worker.on('message', (response: ToolExecutionResponse) => {
      if (response.requestId === requestId && !completed) {
        completed = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        worker.terminate();
        
        if (response.success && response.result) {
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

