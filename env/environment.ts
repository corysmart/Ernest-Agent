import type { ActionResult, AgentAction, StateObservation } from './types';

export interface Environment {
  observe(): Promise<StateObservation>;
  act(action: AgentAction): Promise<ActionResult>;
}
