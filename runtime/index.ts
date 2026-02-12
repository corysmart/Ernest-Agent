/**
 * Runtime module: Agent orchestration, heartbeat, event triggers, observation pipeline.
 */

export { AgentRuntime } from './agent-runtime';
export type { AgentRuntimeOptions } from './types';
export { ObservationNormalizer } from './observation-normalizer';
export type { ObservationNormalizerOptions } from './observation-normalizer';
export { StaticObservationAdapter } from './static-observation-adapter';
export type { ObservationAdapter } from './observation-adapter';
export type {
  RunProvider,
  RunOnceContext,
  RuntimeAuditLogger,
  RuntimeAuditContext,
  RuntimeAuditEvent,
  TenantBudget,
  CircuitBreakerConfig,
  KillSwitchState,
  RawTextObservation
} from './types';
