/**
 * Runtime types for the Agent Runtime layer.
 * Defines interfaces for orchestration, budgets, and audit events.
 */

import type { AgentLoopResult } from '../core/contracts/agent';
import type { StateObservation } from '../env/types';

/** Deterministic run identifier for audit and tracking. */
export interface RunId {
  /** Unique run identifier (e.g., uuid or deterministic hash). */
  id: string;
  /** Tenant scope for multi-tenancy. */
  tenantId: string;
  /** Timestamp when the run was scheduled (ms since epoch). */
  scheduledAt: number;
}

/** Context passed to audit logging for runtime events. */
export interface RuntimeAuditContext {
  tenantId: string;
  requestId?: string;
  runId: string;
  /** State transition or event type for audit. */
  event: RuntimeAuditEvent;
  data?: Record<string, unknown>;
}

export type RuntimeAuditEvent =
  | 'run_started'
  | 'run_completed'
  | 'run_blocked_budget'
  | 'run_blocked_circuit_breaker'
  | 'run_blocked_kill_switch'
  | 'run_error'
  | 'circuit_breaker_opened'
  | 'circuit_breaker_recovered';

/** Per-tenant budget configuration. */
export interface TenantBudget {
  /** Maximum agent runs per hour. */
  maxRunsPerHour: number;
  /** Maximum tokens consumed per day (24-hour rolling). */
  maxTokensPerDay: number;
}

/** Circuit breaker configuration per tenant. */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening. */
  failureThreshold: number;
  /** Cooldown period in ms before allowing retry. */
  cooldownMs: number;
}

/** In-memory kill switch state. */
export interface KillSwitchState {
  /** When true, runtime will not execute runs globally. */
  enabled: boolean;
}

/** Provider of a single agent run. Abstraction for DI; runtime does not depend on CognitiveAgent directly. */
export interface RunProvider {
  runOnce(
    context: { tenantId: string; requestId?: string; runId: string }
  ): Promise<{ result: AgentLoopResult; tokensUsed?: number }>;
}

/** Options for constructing AgentRuntime. */
export interface AgentRuntimeOptions {
  /** Provider that executes a single agent loop. */
  runProvider: RunProvider;
  /** Heartbeat interval in ms. */
  heartbeatIntervalMs: number;
  /** Per-tenant budget limits. Key = tenantId. */
  tenantBudgets?: Map<string, TenantBudget>;
  /** Circuit breaker config per tenant. Key = tenantId. */
  circuitBreakerConfig?: Map<string, CircuitBreakerConfig>;
  /** Kill switch state (shared reference for in-memory toggle). */
  killSwitch?: KillSwitchState;
  /** Audit logger for runtime events. */
  auditLogger?: RuntimeAuditLogger;
  /** Optional clock for deterministic tests. Default: Date.now */
  getTime?: () => number;
  /** Optional timer functions for deterministic tests. */
  timers?: Pick<typeof globalThis, 'setInterval' | 'clearInterval'>;
  /** Optional run ID generator. Default: uuid-based. */
  generateRunId?: (tenantId: string) => string;
}

/** Logger for runtime audit events (no dependency on StructuredAuditLogger). */
export interface RuntimeAuditLogger {
  logRuntimeEvent(context: RuntimeAuditContext): void | Promise<void>;
}

/**
 * Raw text observation from an adapter.
 * Keys are input names (e.g., "user_message", "context"); values are text content.
 */
export interface RawTextObservation {
  [key: string]: string;
}

/**
 * Normalized observation produced by ObservationNormalizer.
 * Re-exports StateObservation for clarity; normalizer enforces caps and safety.
 */
export type NormalizedObservation = StateObservation;
