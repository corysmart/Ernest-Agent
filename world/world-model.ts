import type { AgentAction, StateObservation } from '../env/types';
import type { OutcomePrediction, WorldState } from './types';
import { assertSafePayload } from '../env/validation';

export interface WorldPredictor {
  canHandle(action: AgentAction): boolean;
  predict(state: WorldState, action: AgentAction): Partial<WorldState> & { uncertainty?: number; score?: number; rationale?: string };
}

export interface WorldModel {
  update(observation: StateObservation): WorldState;
  simulate(state: WorldState, action: AgentAction): OutcomePrediction;
  updateFromResult(state: WorldState, result: { success: boolean; observation?: StateObservation }): WorldState;
}

interface WorldModelOptions {
  initialState?: WorldState;
  predictors?: WorldPredictor[];
}

export class RuleBasedWorldModel implements WorldModel {
  private state: WorldState;
  private readonly predictors: WorldPredictor[];

  constructor(options: WorldModelOptions = {}) {
    this.state = options.initialState ?? { timestamp: Date.now(), facts: {}, uncertainty: 0.5 };
    this.predictors = options.predictors ?? [];
  }

  update(observation: StateObservation): WorldState {
    this.state = {
      timestamp: observation.timestamp,
      facts: { ...this.state.facts, ...sanitizeFacts(observation.state) },
      uncertainty: clamp(this.state.uncertainty * 0.9)
    };

    return this.state;
  }

  simulate(state: WorldState, action: AgentAction): OutcomePrediction {
    if (!action.type) {
      throw new Error('Action type is required');
    }

    assertSafePayload(action.payload);

    const predictor = this.predictors.find((item) => item.canHandle(action));
    const prediction = predictor ? predictor.predict(state, action) : {};

    const rawUncertainty = prediction.uncertainty ?? Math.min(1, state.uncertainty + 0.2);
    if (rawUncertainty < 0 || rawUncertainty > 1) {
      throw new Error('Uncertainty must be between 0 and 1');
    }

    const expectedState: WorldState = {
      timestamp: Date.now(),
      facts: { ...state.facts, ...sanitizeFacts(prediction.facts ?? {}) },
      uncertainty: clamp(rawUncertainty)
    };

    const score = prediction.score ?? scoreOutcome(expectedState);

    return {
      action,
      expectedState,
      uncertainty: expectedState.uncertainty,
      score,
      rationale: prediction.rationale
    };
  }

  updateFromResult(state: WorldState, result: { success: boolean; observation?: StateObservation }): WorldState {
    if (result.observation) {
      return this.update(result.observation);
    }

    return {
      ...state,
      uncertainty: clamp(state.uncertainty + (result.success ? -0.05 : 0.1))
    };
  }
}

function sanitizeFacts(facts: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error('Unsafe payload');
    }
    cleaned[key] = value;
  }
  return cleaned;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function scoreOutcome(state: WorldState): number {
  return clamp(1 - state.uncertainty);
}
