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

    expect(() => model.simulate(state, { type: 'bad', payload: { __proto__: { polluted: true } } as Record<string, unknown> })).toThrow('Unsafe payload');
  });

  it('throws when action type is missing', () => {
    const model = new RuleBasedWorldModel();
    const observation: StateObservation = { timestamp: 1, state: {} };
    const state = model.update(observation);

    expect(() => model.simulate(state, { type: '', payload: {} })).toThrow('Action type is required');
  });

  it('updateFromResult with observation updates state', () => {
    const model = new RuleBasedWorldModel();
    const observation: StateObservation = { timestamp: 1, state: { x: 1 } };
    const state = model.update(observation);

    const next = model.updateFromResult(state, {
      success: true,
      observation: { timestamp: 2, state: { y: 2 } }
    });
    expect(next.facts).toMatchObject({ x: 1, y: 2 });
  });

  it('updateFromResult without observation adjusts uncertainty', () => {
    const model = new RuleBasedWorldModel({ initialState: { timestamp: 0, facts: {}, uncertainty: 0.5 } });
    const state = model.update({ timestamp: 0, state: {} });

    const afterSuccess = model.updateFromResult(state, { success: true });
    expect(afterSuccess.uncertainty).toBeLessThan(0.5);

    const afterFail = model.updateFromResult(state, { success: false });
    expect(afterFail.uncertainty).toBeGreaterThan(0.5);
  });

  it('uses custom initialState', () => {
    const model = new RuleBasedWorldModel({
      initialState: { timestamp: 100, facts: { preset: true }, uncertainty: 0.2 }
    });
    const state = model.update({ timestamp: 101, state: { added: true } });
    expect(state.facts).toMatchObject({ preset: true, added: true });
  });

  it('simulate without predictor uses default uncertainty', () => {
    const model = new RuleBasedWorldModel();
    const state = model.update({ timestamp: 1, state: {} });
    const pred = model.simulate(state, { type: 'unknown' });
    expect(pred.uncertainty).toBeGreaterThan(0);
    expect(pred.score).toBeGreaterThanOrEqual(0);
  });

  it('limits facts to 1000 when exceeding MAX_FACTS', () => {
    const model = new RuleBasedWorldModel();
    const facts: Record<string, unknown> = {};
    for (let i = 0; i < 1100; i++) facts[`k${i}`] = i;
    const state = model.update({ timestamp: 1, state: facts });
    expect(Object.keys(state.facts)).toHaveLength(1000);
  });

  it('sanitizeFacts truncates long strings', () => {
    const model = new RuleBasedWorldModel();
    const longString = 'a'.repeat(15000);
    const state = model.update({ timestamp: 1, state: { big: longString } });
    expect((state.facts.big as string).endsWith('...[TRUNCATED]')).toBe(true);
  });

  it('sanitizeFacts handles arrays in state', () => {
    const model = new RuleBasedWorldModel();
    const state = model.update({ timestamp: 1, state: { items: [1, 2, 3] } });
    expect(state.facts.items).toEqual([1, 2, 3]);
  });

  it('sanitizeFacts rejects unsafe keys in nested prediction', () => {
    const model = new RuleBasedWorldModel({
      predictors: [
        {
          canHandle: () => true,
          predict: () => ({ facts: { constructor: { x: 1 } } })
        }
      ]
    });
    const state = model.update({ timestamp: 1, state: {} });
    expect(() => model.simulate(state, { type: 'test' })).toThrow('Unsafe payload');
  });
});
