import { RuleBasedWorldModel } from '../../world/world-model';
import type { StateObservation, AgentAction } from '../../env/types';

describe('RuleBasedWorldModel', () => {
  it('updates world state from observation', () => {
    const model = new RuleBasedWorldModel();
    const observation: StateObservation = { timestamp: 10, state: { status: 'ok' } };

    const state = model.update(observation);

    expect(state.timestamp).toBe(10);
    expect(state.facts.status).toBe('ok');
  });

  it('simulates action outcomes via predictor', () => {
    const model = new RuleBasedWorldModel({
      predictors: [
        {
          canHandle: (action: AgentAction) => action.type === 'stabilize',
          predict: (state, action) => ({
            facts: { ...state.facts, stabilized: action.payload?.level ?? 'high' },
            uncertainty: 0.1,
            score: 0.9
          })
        }
      ]
    });

    const observation: StateObservation = { timestamp: 5, state: { status: 'warning' } };
    const state = model.update(observation);
    const prediction = model.simulate(state, { type: 'stabilize', payload: { level: 'medium' } });

    expect(prediction.expectedState.facts.stabilized).toBe('medium');
    expect(prediction.uncertainty).toBeLessThan(0.5);
  });

  it('rejects predictors that return invalid uncertainty', () => {
    const model = new RuleBasedWorldModel({
      predictors: [
        {
          canHandle: () => true,
          predict: () => ({ facts: {}, uncertainty: 2 })
        }
      ]
    });

    const observation: StateObservation = { timestamp: 1, state: {} };
    const state = model.update(observation);

    expect(() => model.simulate(state, { type: 'bad' })).toThrow('Uncertainty must be between 0 and 1');
  });

  it('rejects unsafe payloads', () => {
    const model = new RuleBasedWorldModel();
    const observation: StateObservation = { timestamp: 1, state: {} };
    const state = model.update(observation);

    expect(() => model.simulate(state, { type: 'bad', payload: { __proto__: { polluted: true } } as any })).toThrow('Unsafe payload');
  });
});
