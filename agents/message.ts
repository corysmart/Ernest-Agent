export type MessageType = 'task' | 'info' | 'alert' | 'handoff' | 'memory';

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: MessageType;
  payload: Record<string, unknown>;
  timestamp: number;
}
