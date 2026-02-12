/**
 * P2: Worker thread script for secure tool execution using module-based registry.
 * 
 * This worker script loads tools from the tool registry module, eliminating the need
 * for eval or handler.toString() serialization. Tools are called by name via IPC.
 * 
 * Security benefits:
 * - No eval or string serialization
 * - Static imports ensure only known tools can execute
 * - Prevents RCE from dynamic/untrusted handlers
 */

import { parentPort } from 'worker_threads';
import { toolRegistry, initializeToolRegistry } from '../tools/registry';

// P1: Initialize tool registry in worker thread
// Workers have their own module scope, so they need to initialize the registry themselves
initializeToolRegistry();

const abortControllers = new Map<string, AbortController>();

parentPort?.on('message', (msg: { type?: string; toolName?: string; input?: Record<string, unknown>; requestId?: string }) => {
  if (msg.type === 'abort' && msg.requestId) {
    const controller = abortControllers.get(msg.requestId);
    if (controller) {
      controller.abort();
      abortControllers.delete(msg.requestId);
    }
    return;
  }

  const request = msg as { toolName: string; input: Record<string, unknown>; requestId: string };
  const requestId = request.requestId;

  (async () => {
    const controller = new AbortController();
    abortControllers.set(requestId, controller);
    const inputWithSignal = { ...request.input, __abortSignal: controller.signal };

    try {
      const handler = toolRegistry.get(request.toolName);

      if (!handler) {
        parentPort?.postMessage({
          requestId,
          success: false,
          error: `Tool ${request.toolName} not found in registry`
        });
        return;
      }

      const result = await handler(inputWithSignal);
      abortControllers.delete(requestId);

      parentPort?.postMessage({
        requestId,
        success: true,
        result
      });
    } catch (error) {
      abortControllers.delete(requestId);
      parentPort?.postMessage({
        requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  })();
});
