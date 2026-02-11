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

parentPort?.on('message', async (request: { toolName: string; input: Record<string, unknown>; requestId: string }) => {
  try {
    const handler = toolRegistry.get(request.toolName);
    
    if (!handler) {
      parentPort?.postMessage({
        requestId: request.requestId,
        success: false,
        error: `Tool ${request.toolName} not found in registry`
      });
      return;
    }

    const result = await handler(request.input);
    
    parentPort?.postMessage({
      requestId: request.requestId,
      success: true,
      result
    });
  } catch (error) {
    parentPort?.postMessage({
      requestId: request.requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
