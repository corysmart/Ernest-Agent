import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createObservabilityAuditLogger } from '../../server/observability-audit-forwarder';
import { ObservabilityStore } from '../../server/observability-store';

describe('createObservabilityAuditLogger', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'obs-audit-'));
  });

  afterEach(() => {
    try {
      rmSync(dataDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it('forwards entries to both console and observability store', () => {
    const store = new ObservabilityStore({ dataDir });
    const logger = createObservabilityAuditLogger(store);

    logger.log({
      timestamp: Date.now(),
      tenantId: 't1',
      requestId: 'r1',
      eventType: 'agent_decision',
      data: { key: 'value' }
    });

    const events = store.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe('agent_decision');
    expect(events[0]!.data).toEqual({ key: 'value' });
  });
});
