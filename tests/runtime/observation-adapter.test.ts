import type { ObservationAdapter } from '../../runtime/observation-adapter';

describe('ObservationAdapter', () => {
  it('is an interface that yields text-based observations', async () => {
    const adapter: ObservationAdapter = {
      async getObservations() {
        return {
          user_message: 'hello',
          context: 'test context'
        };
      }
    };

    const result = await adapter.getObservations();

    expect(result).toEqual({ user_message: 'hello', context: 'test context' });
  });
});
