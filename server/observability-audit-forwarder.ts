/**
 * Audit logger that forwards entries to both console and the observability store.
 * Used when OBS_UI_ENABLED to feed the UI's event stream.
 */

import type { AuditLogger, AuditLogEntry } from '../security/audit-logger';
import { ConsoleAuditLogger } from '../security/audit-logger';
import type { ObservabilityStore } from './observability-store';

export function createObservabilityAuditLogger(obsStore: ObservabilityStore): AuditLogger {
  const consoleLogger = new ConsoleAuditLogger();
  return {
    log(entry: AuditLogEntry): void {
      consoleLogger.log(entry);
      obsStore.addEvent({
        timestamp: entry.timestamp,
        tenantId: entry.tenantId,
        requestId: entry.requestId,
        eventType: entry.eventType,
        data: entry.data
      });
    }
  };
}
