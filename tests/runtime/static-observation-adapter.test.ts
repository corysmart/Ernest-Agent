import { StaticObservationAdapter } from '../../runtime/static-observation-adapter';

describe('StaticObservationAdapter', () => {
  it('returns fixed observations from constructor', async () => {
    const adapter = new StaticObservationAdapter({
      user_message: 'hello',
      context: 'test'
    });

    const result = await adapter.getObservations();

    expect(result).toEqual({ user_message: 'hello', context: 'test' });
  });

  it('returns a copy to prevent mutation', async () => {
    const obs = { key: 'value' };
    const adapter = new StaticObservationAdapter(obs);

    const result = await adapter.getObservations();
    result.key = 'mutated';

    expect(obs.key).toBe('value');
  });
});
