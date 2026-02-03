export interface WorldState {
  timestamp: number;
  facts: Record<string, unknown>;
  uncertainty: number;
}

export interface OutcomePrediction {
  action: { type: string; payload?: Record<string, unknown> };
  expectedState: WorldState;
  uncertainty: number;
  score: number;
  rationale?: string;
}
