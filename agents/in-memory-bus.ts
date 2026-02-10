import type { AgentMessage } from './message';
import type { MessageBus } from './message-bus';

export class InMemoryMessageBus implements MessageBus {
  private readonly listeners = new Map<string, Set<(message: AgentMessage) => void>>();

  async publish(message: AgentMessage): Promise<void> {
    const handlers = this.listeners.get(message.to);
    if (!handlers) {
      return;
    }

    // P3: Clone message for each handler to prevent mutation by handlers
    // If one handler mutates the payload, subsequent handlers should observe original data
    // Each handler gets its own cloned message to ensure complete isolation
    const clonePayload = (payload: Record<string, unknown> | undefined): Record<string, unknown> => {
      if (!payload) {
        return {};
      }
      // Use structuredClone if available (handles circular refs better), otherwise fall back to JSON
      try {
        if (typeof structuredClone !== 'undefined') {
          return structuredClone(payload);
        } else {
          return JSON.parse(JSON.stringify(payload));
        }
      } catch (error) {
        // If cloning fails (e.g., circular refs), use shallow copy as fallback
        return { ...payload };
      }
    };

    // P2: Isolate handler failures to prevent one failure from blocking other subscribers
    // Each handler is wrapped in try/catch to ensure all subscribers receive the message
    // Each handler gets its own cloned message to prevent cross-handler mutation
    const errors: Error[] = [];
    handlers.forEach((handler) => {
      try {
        // Clone message for each handler to ensure complete isolation
        const clonedMessage: AgentMessage = {
          ...message,
          payload: clonePayload(message.payload)
        };
        handler(clonedMessage);
      } catch (error) {
        // Log error but continue processing other handlers
        errors.push(error instanceof Error ? error : new Error(String(error)));
        // Optionally surface error telemetry (could be extended to use a logger)
        console.error(`[MessageBus] Handler error for message to ${message.to}:`, error);
      }
    });

    // If all handlers failed, throw to signal publish failure
    // Otherwise, individual handler failures are isolated
    if (errors.length === handlers.size && handlers.size > 0) {
      throw new Error(`All handlers failed for message to ${message.to}: ${errors.map((e) => e.message).join('; ')}`);
    }
  }

  subscribe(agentId: string, handler: (message: AgentMessage) => void): () => void {
    if (!this.listeners.has(agentId)) {
      this.listeners.set(agentId, new Set());
    }

    const set = this.listeners.get(agentId)!;
    set.add(handler);

    return () => {
      set.delete(handler);
    };
  }
}
