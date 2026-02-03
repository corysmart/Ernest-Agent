import type { Environment } from '../env/environment';
import type { ActionResult, AgentAction, StateObservation } from '../env/types';
import type { SandboxedToolRunner } from '../security/sandboxed-tool-runner';

export class RequestEnvironment implements Environment {
  private readonly observation: StateObservation;
  private readonly toolRunner: SandboxedToolRunner;

  constructor(observation: StateObservation, toolRunner: SandboxedToolRunner) {
    this.observation = observation;
    this.toolRunner = toolRunner;
  }

  async observe(): Promise<StateObservation> {
    return this.observation;
  }

  async act(action: AgentAction): Promise<ActionResult> {
    try {
      const outputs = await this.toolRunner.run(action.type, action.payload ?? {});
      return { success: true, outputs };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      };
    }
  }
}
