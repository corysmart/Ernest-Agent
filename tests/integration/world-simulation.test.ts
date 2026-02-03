import { RuleBasedWorldModel } from '../../world/world-model';

describe('Integration: world model simulation', () => {
  it('updates state and simulates action outcome', () => {
    const model = new RuleBasedWorldModel({
      predictors: [
        {
          canHandle: (action) => action.type === 'patch',
          predict: (state) => ({
            facts: { ...state.facts, patched: true },
            uncertainty: 0.2,
            score: 0.8
          })
        }
      ]
    });

    const state = model.update({ timestamp: 1, state: { status: 'vulnerable' } });
    const prediction = model.simulate(state, { type: 'patch' });

    expect(prediction.expectedState.facts.patched).toBe(true);
    const updated = model.updateFromResult(state, { success: true });
    expect(updated.uncertainty).toBeLessThan(state.uncertainty + 0.2);
  });
});
