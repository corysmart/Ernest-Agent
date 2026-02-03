export interface AgentDecision {
  actionType: string;
  actionPayload?: Record<string, unknown>;
  confidence: number;
  reasoning?: string;
}

export type AgentState =
  | 'observe'
  | 'retrieve_memory'
  | 'update_world'
  | 'update_self'
  | 'plan_goals'
  | 'simulate'
  | 'query_llm'
  | 'validate_output'
  | 'act'
  | 'store_results'
  | 'learn'
  | 'complete'
  | 'error';

export interface AgentLoopResult {
  status: 'completed' | 'idle' | 'error';
  error?: string;
  decision?: AgentDecision;
  actionResult?: { success: boolean; error?: string };
  selectedGoalId?: string;
  stateTrace?: AgentState[];
}
