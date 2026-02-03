import type { AgentMessage } from './message';
import type { MessageBus } from './message-bus';

export class InMemoryMessageBus implements MessageBus {
  private readonly listeners = new Map<string, Set<(message: AgentMessage) => void>>();

  async publish(message: AgentMessage): Promise<void> {
    const handlers = this.listeners.get(message.to);
    if (!handlers) {
      return;
    }

    handlers.forEach((handler) => handler(message));
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
