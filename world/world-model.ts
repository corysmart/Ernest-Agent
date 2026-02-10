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
    // P3: Limit world state size to prevent unbounded growth from user input
    // Cap keys, depth, and total serialized size to prevent memory bloat
    const sanitizedFacts = sanitizeFacts(observation.state);
    const mergedFacts = { ...this.state.facts, ...sanitizedFacts };
    
    // Limit total number of keys to prevent unbounded growth
    const MAX_FACTS = 1000;
    const factKeys = Object.keys(mergedFacts);
    if (factKeys.length > MAX_FACTS) {
      // Keep only the most recent facts (simple FIFO - could be improved with LRU)
      const keysToKeep = factKeys.slice(-MAX_FACTS);
      const limitedFacts: Record<string, unknown> = {};
      for (const key of keysToKeep) {
        limitedFacts[key] = mergedFacts[key];
      }
      this.state = {
        timestamp: observation.timestamp,
        facts: limitedFacts,
        uncertainty: clamp(this.state.uncertainty * 0.9)
      };
    } else {
      this.state = {
        timestamp: observation.timestamp,
        facts: mergedFacts,
        uncertainty: clamp(this.state.uncertainty * 0.9)
      };
    }

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
  const MAX_DEPTH = 10; // P3: Limit depth to prevent deeply nested structures
  const MAX_KEY_LENGTH = 256; // Limit key length
  
  function sanitizeValue(value: unknown, depth: number): unknown {
    if (depth > MAX_DEPTH) {
      return '[DEPTH_LIMIT_EXCEEDED]';
    }
    
    if (value === null || value === undefined) {
      return value;
    }
    
    if (typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          throw new Error('Unsafe payload');
        }
        if (key.length > MAX_KEY_LENGTH) {
          continue; // Skip overly long keys
        }
        sanitized[key] = sanitizeValue(val, depth + 1);
      }
      return sanitized;
    }
    
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, depth + 1));
    }
    
    // Limit string length to prevent huge strings
    if (typeof value === 'string' && value.length > 10000) {
      return value.substring(0, 10000) + '...[TRUNCATED]';
    }
    
    return value;
  }
  
  for (const [key, value] of Object.entries(facts)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error('Unsafe payload');
    }
    if (key.length > MAX_KEY_LENGTH) {
      continue; // Skip overly long keys
    }
    cleaned[key] = sanitizeValue(value, 0);
  }
  return cleaned;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function scoreOutcome(state: WorldState): number {
  return clamp(1 - state.uncertainty);
}
