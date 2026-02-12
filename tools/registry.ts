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
import { invokeCodex } from './invoke-codex';
import { invokeClaude } from './invoke-claude';

export interface ToolDefinition {
  name: string;
  handler: ToolHandler;
  description?: string;
}

class ToolRegistry {
  private readonly tools = new Map<string, ToolHandler>();
  private locked = false; // P3: Lock registry after initialization to prevent runtime mutations

  /**
   * Register a tool in the registry.
   * Tools must be registered at startup from static imports.
   * 
   * P1: Idempotent registration - if tool is already registered, skip silently.
   * This allows initializeToolRegistry() to be called multiple times (e.g., in tests)
   * without throwing errors.
   * 
   * P3: After initialization is complete, the registry is locked and no new tools can be registered.
   * This enforces the "static imports only" policy and prevents runtime mutations.
   * However, idempotent re-registration of existing tools is allowed even when locked.
   */
  register(tool: ToolDefinition): void {
    // P1: Idempotent check - if already registered, skip silently (even if locked)
    if (this.tools.has(tool.name)) {
      return;
    }
    
    // P3: After initialization is complete, the registry is locked and no new tools can be registered.
    // This enforces the "static imports only" policy and prevents runtime mutations.
    if (this.locked) {
      throw new Error(
        `Tool registry is locked. Cannot register new tool ${tool.name} after initialization. ` +
        `All tools must be registered via initializeToolRegistry() at startup. ` +
        `This enforces the "static imports only" security policy.`
      );
    }
    
    this.tools.set(tool.name, tool.handler);
  }

  /**
   * P3: Lock the registry to prevent further registrations.
   * After locking, only get(), has(), and list() operations are allowed.
   * This enforces the "static imports only" security policy.
   */
  lock(): void {
    this.locked = true;
  }

  /**
   * P3: Check if the registry is locked.
   */
  isLocked(): boolean {
    return this.locked;
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
 * P3: After initialization, the registry is locked to prevent runtime mutations.
 */
export function initializeToolRegistry(): void {
  // Register all tools from static imports
  toolRegistry.register({
    name: 'pursue_goal',
    handler: pursueGoal,
    description: 'Pursue a goal with the given input'
  });

  toolRegistry.register({
    name: 'invoke_codex',
    handler: invokeCodex,
    description: 'Run OpenAI Codex CLI with a prompt. Uses ChatGPT subscription.'
  });

  toolRegistry.register({
    name: 'invoke_claude',
    handler: invokeClaude,
    description: 'Run Claude Code CLI with a prompt. Uses Pro/Max/Teams subscription.'
  });

  // Add more tools here as they are created
  // Example:
  // toolRegistry.register({
  //   name: 'another_tool',
  //   handler: anotherToolHandler,
  //   description: 'Description of another tool'
  // });

  // P3: Lock the registry after initialization to prevent runtime mutations
  // This enforces the "static imports only" security policy
  toolRegistry.lock();
}

