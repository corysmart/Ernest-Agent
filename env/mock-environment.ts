import type { Environment } from './environment';
import type { ActionResult, AgentAction, StateObservation } from './types';
import { assertSafePayload } from './validation';

interface MockEnvironmentOptions {
  observations: StateObservation[];
  onAct?: (action: AgentAction) => Promise<ActionResult> | ActionResult;
}

export class MockEnvironment implements Environment {
  private readonly observations: StateObservation[];
  private readonly onAct?: (action: AgentAction) => Promise<ActionResult> | ActionResult;

  constructor(options: MockEnvironmentOptions) {
    this.observations = [...options.observations];
    this.onAct = options.onAct;
  }

  async observe(): Promise<StateObservation> {
    const next = this.observations.shift();
    if (!next) {
      throw new Error('No observations available');
    }

    return next;
  }

  async act(action: AgentAction): Promise<ActionResult> {
    if (!action.type) {
      throw new Error('Action type is required');
    }

    assertSafePayload(action.payload);

    if (this.onAct) {
      return this.onAct(action);
    }

    return { success: true, outputs: { action: action.type } };
  }
}
