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

export type DryRunMode = 'with-llm' | 'without-llm';

export interface AgentLoopResult {
  status: 'completed' | 'idle' | 'error' | 'dry_run';
  error?: string;
  decision?: AgentDecision;
  actionResult?: { success: boolean; error?: string; skipped?: boolean };
  selectedGoalId?: string;
  stateTrace?: AgentState[];
  /** Set when status is dry_run */
  dryRunMode?: DryRunMode;
}
