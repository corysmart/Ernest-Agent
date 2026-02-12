export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface StateObservation {
  timestamp: number;
  state: Record<string, unknown>;
  events?: string[];
  conversation_history?: ConversationEntry[];
}

export interface AgentAction {
  type: string;
  payload?: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  observation?: StateObservation;
  error?: string;
  outputs?: Record<string, unknown>;
}
