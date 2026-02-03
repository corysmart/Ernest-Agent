import { SelfModel } from '../../self/self-model';

describe('SelfModel', () => {
  it('updates capabilities and tool access', () => {
    const model = new SelfModel();
    model.updateCapabilities(['memory', 'planning', 'memory']);
    model.updateTools(['search', 'db']);

    const snapshot = model.snapshot();
    expect(snapshot.capabilities).toEqual(['memory', 'planning']);
    expect(snapshot.tools).toEqual(['search', 'db']);
  });

  it('reduces confidence on failure', () => {
    const model = new SelfModel();
    const initial = model.snapshot();

    model.recordOutcome(false);
    const updated = model.snapshot();

    expect(updated.confidence).toBeLessThan(initial.confidence);
    expect(updated.reliability).toBeLessThan(initial.reliability);
  });

  it('rejects invalid capability names', () => {
    const model = new SelfModel();
    expect(() => model.updateCapabilities([''])).toThrow('Invalid capability');
  });
});
