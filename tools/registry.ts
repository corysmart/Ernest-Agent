/**
 * P2: Module-based tool registry for secure tool execution.
 * 
 * This registry loads tools from static module imports, eliminating the need for
 * eval-based handler serialization. Tools are registered at startup and can be
 * safely executed in worker threads via IPC.
 * 
 * Security benefits:
 * - No eval or handler.toString() serialization
 * - Static imports ensure only known, validated tools can execute
 * - Tools can be loaded in worker threads without serialization
 * - Prevents RCE from dynamic/untrusted handlers
 */

import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { pursueGoal } from './pursue-goal';

export interface ToolDefinition {
  name: string;
  handler: ToolHandler;
  description?: string;
}

class ToolRegistry {
  private readonly tools = new Map<string, ToolHandler>();

  /**
   * Register a tool in the registry.
   * Tools must be registered at startup from static imports.
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool.handler);
  }

  /**
   * Get a tool handler by name.
   * Returns undefined if tool is not registered.
   */
  get(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tool names.
   */
  list(): string[] {
    return Array.from(this.tools.keys());
  }
}

// Singleton registry instance
export const toolRegistry = new ToolRegistry();

/**
 * Initialize the tool registry with all available tools.
 * This should be called at application startup.
 * 
 * P2: All tools must be statically imported - no dynamic loading.
 */
export function initializeToolRegistry(): void {
  // Register all tools from static imports
  toolRegistry.register({
    name: 'pursue_goal',
    handler: pursueGoal,
    description: 'Pursue a goal with the given input'
  });

  // Add more tools here as they are created
  // Example:
  // toolRegistry.register({
  //   name: 'another_tool',
  //   handler: anotherToolHandler,
  //   description: 'Description of another tool'
  // });
}

