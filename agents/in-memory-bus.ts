import type { AgentMessage } from './message';
import type { MessageBus } from './message-bus';

export class InMemoryMessageBus implements MessageBus {
  private readonly listeners = new Map<string, Set<(message: AgentMessage) => void>>();

  async publish(message: AgentMessage): Promise<void> {
    const handlers = this.listeners.get(message.to);
    if (!handlers) {
      return;
    }

    // P2: Isolate handler failures to prevent one failure from blocking other subscribers
    // Each handler is wrapped in try/catch to ensure all subscribers receive the message
    const errors: Error[] = [];
    handlers.forEach((handler) => {
      try {
        handler(message);
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
