import { CompositeObservationAdapter, StaticObservationAdapter } from '../../runtime';
import type { ObservationAdapter } from '../../runtime/observation-adapter';

describe('CompositeObservationAdapter', () => {
  it('merges observations from multiple adapters', async () => {
    const a = new StaticObservationAdapter({ a: '1', b: '2' });
    const b = new StaticObservationAdapter({ b: 'overridden', c: '3' });
    const composite = new CompositeObservationAdapter([a, b]);

    const obs = await composite.getObservations();

    expect(obs.a).toBe('1');
    expect(obs.b).toBe('overridden');
    expect(obs.c).toBe('3');
  });

  it('returns empty when no adapters', async () => {
    const composite = new CompositeObservationAdapter([]);
    const obs = await composite.getObservations();
    expect(obs).toEqual({});
  });

  it('continues when one adapter throws', async () => {
    const okAdapter = new StaticObservationAdapter({ a: '1' });
    const badAdapter: ObservationAdapter = {
      async getObservations() {
        throw new Error('Adapter failed');
      }
    };
    const composite = new CompositeObservationAdapter([okAdapter, badAdapter]);

    const obs = await composite.getObservations();

    expect(obs.a).toBe('1');
  });

  it('returns single adapter result when only one', async () => {
    const a = new StaticObservationAdapter({ x: 'y' });
    const composite = new CompositeObservationAdapter([a]);
    const obs = await composite.getObservations();
    expect(obs).toEqual({ x: 'y' });
  });
});
