import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ObservabilityStore } from '../../server/observability-store';

describe('ObservabilityStore', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'obs-store-'));
  });

  afterEach(() => {
    try {
      rmSync(dataDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it('adds and retrieves runs', () => {
    const store = new ObservabilityStore({ dataDir, maxRuns: 5 });
    store.addRun({
      requestId: 'r1',
      timestamp: Date.now(),
      status: 'completed'
    });
    const runs = store.getRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.requestId).toBe('r1');
  });

  it('addRunStart adds active run and event', () => {
    const store = new ObservabilityStore({ dataDir });
    store.addRunStart('req1', 'tenant1');
    const active = store.getActiveRuns();
    expect(active).toHaveLength(1);
    expect(active[0]!.requestId).toBe('req1');
    expect(store.getEvents()[0]!.eventType).toBe('run_start');
  });

  it('addEvent adds to events', () => {
    const store = new ObservabilityStore({ dataDir });
    store.addEvent({
      timestamp: Date.now(),
      eventType: 'custom',
      data: { x: 1 }
    });
    expect(store.getEvents()[0]!.eventType).toBe('custom');
  });

  it('addEvent updates active run state when eventType is run_progress', () => {
    const store = new ObservabilityStore({ dataDir });
    store.addRunStart('r1');
    store.addEvent({
      timestamp: Date.now(),
      requestId: 'r1',
      eventType: 'run_progress',
      data: { state: 'thinking', stateTrace: ['observe', 'think'] }
    });
    const active = store.getActiveRuns();
    expect(active[0]!.currentState).toBe('thinking');
    expect(active[0]!.stateTrace).toEqual(['observe', 'think']);
  });

  it('subscribe adds and removes listener', () => {
    const store = new ObservabilityStore({ dataDir });
    const events: unknown[] = [];
    const unsub = store.subscribe((e) => events.push(e));

    store.addEvent({ timestamp: 1, eventType: 'e1', data: {} });
    expect(events).toHaveLength(1);

    unsub();
    store.addEvent({ timestamp: 2, eventType: 'e2', data: {} });
    expect(events).toHaveLength(1);
  });

  it('clear resets state', () => {
    const store = new ObservabilityStore({ dataDir });
    store.addRun({ requestId: 'r1', timestamp: 1, status: 'completed' });
    store.clear();
    expect(store.getRuns()).toHaveLength(0);
  });

  it('limits runs to maxRuns', () => {
    const store = new ObservabilityStore({ dataDir, maxRuns: 3 });
    for (let i = 0; i < 5; i++) {
      store.addRun({ requestId: `r${i}`, timestamp: i, status: 'completed' });
    }
    expect(store.getRuns()).toHaveLength(3);
  });
});
