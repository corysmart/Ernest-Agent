import type { AgentMessage } from './message';

export interface MessageBus {
  publish(message: AgentMessage): Promise<void>;
  subscribe(agentId: string, handler: (message: AgentMessage) => void): () => void;
}
