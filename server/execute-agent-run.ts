/**
 * Core agent execution used by /agent/run-once and heartbeat trigger.
 * Builds observation from OpenClaw + request, runs cognitive agent, returns result.
 */

import { CognitiveAgent } from '../core/agent/cognitive-agent';
import { RequestEnvironment } from './request-environment';
import { OpenClawWorkspaceAdapter } from '../env/openclaw-workspace-adapter';
import { CompositeObservationAdapter } from '../runtime/composite-observation-adapter';
import { ObservationNormalizer } from '../runtime/observation-normalizer';
import { RequestObservationAdapter } from './request-observation-adapter';
import { RuleBasedWorldModel } from '../world/world-model';
import { SelfModel } from '../self/self-model';
import { GoalStack } from '../goals/goal-stack';
import { HeuristicPlanner } from '../goals/planner';
import type { MemoryManager } from '../memory/memory-manager';
import { ScopedMemoryManager } from '../memory/scoped-memory-manager';
import { StructuredAuditLogger } from '../security/audit-logger';
import type { LLMAdapter } from '../core/contracts/llm';
import type { PromptInjectionFilter, OutputValidator } from '../core/contracts/security';
import type { AgentDecision } from '../core/contracts/agent';
import type { ToolPermissionGate } from '../core/contracts/security';
import type { AgentLoopResult } from '../core/contracts/agent';
import type { SandboxedToolRunner } from '../security/sandboxed-tool-runner';
import type { Container } from '../core/di/container';
import type { ObservabilityStore } from './observability-store';
import { createObservabilityAuditLogger } from './observability-audit-forwarder';
import { getFileWorkspaceRoot, isRiskyWorkspaceModeEnabled } from '../tools/file-workspace';
import { resolve } from 'path';

export interface ExecuteAgentRunParams {
  observation: {
    timestamp?: number;
    state?: Record<string, unknown>;
    events?: string[];
    conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };
  goal?: {
    id: string;
    title: string;
    description?: string;
    priority?: number;
    horizon?: 'short' | 'long';
    candidateActions?: Array<{ type: string; payload?: Record<string, unknown> }>;
  };
  tenantId?: string;
  requestId: string;
  dryRun?: false | 'with-llm' | 'without-llm';
  runTimeoutMs: number;
  maxMultiActSteps: number;
}

export interface ExecuteAgentRunResult {
  result: AgentLoopResult;
  durationMs: number;
}

export async function executeAgentRun(
  container: Container,
  toolRunner: SandboxedToolRunner,
  obsStore: ObservabilityStore | null,
  params: ExecuteAgentRunParams
): Promise<ExecuteAgentRunResult> {
  const { observation, goal: effectiveGoal, tenantId, requestId, dryRun, runTimeoutMs, maxMultiActSteps } = params;
  const runStartMs = Date.now();

  const baseMemoryManager = container.resolve<MemoryManager>('memoryManager');
  const memoryScope = tenantId ?? requestId;
  const persistMemory = Boolean(tenantId);
  const scopedMemoryManager = new ScopedMemoryManager(baseMemoryManager, memoryScope, persistMemory);

  const baseLogger = obsStore ? createObservabilityAuditLogger(obsStore) : undefined;
  const auditLogger = new StructuredAuditLogger(baseLogger);

  const goalStack = new GoalStack();
  if (effectiveGoal) {
    try {
      goalStack.addGoal({
        ...effectiveGoal,
        priority: effectiveGoal.priority ?? 1,
        horizon: effectiveGoal.horizon ?? 'short',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    } catch (error) {
      throw new Error(`Goal conflict: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const openclaw = new OpenClawWorkspaceAdapter({
    // Default to repo-local workspace/ for easier local development.
    workspaceRoot: process.env.OPENCLAW_WORKSPACE_ROOT ?? resolve(process.cwd(), 'workspace'),
    includeDailyMemory: true
  });
  const fileWorkspaceRoot = getFileWorkspaceRoot();
  const riskyMode = isRiskyWorkspaceModeEnabled();
  const requestState = {
    ...observation.state,
    _file_workspace_root: fileWorkspaceRoot,
    ...(riskyMode && {
      _create_workspace_hint: 'When bootstrapping sibling repos (e.g. ernest-mail), use create_workspace with path "ernest-mail" only—never "workspace/ernest-mail" or suffixed variants like "ernest-mail 2". Use the exact canonical name; if the workspace exists, pass allowExisting: true. For list_dir, read_file, run_command: use path "ernest-mail" (sibling dir), not "workspace/ernest-mail". run_command cwd should be the resolved project path.'
    })
  };
  const requestAdapter = new RequestObservationAdapter({
    timestamp: observation.timestamp ?? Date.now(),
    state: requestState,
    events: observation.events,
    conversation_history: observation.conversation_history
  });
  const composite = new CompositeObservationAdapter([openclaw, requestAdapter]);
  const rawObs = await composite.getObservations();
  const normalizer = new ObservationNormalizer();
  const normalizedObs = normalizer.normalize(rawObs);
  normalizedObs.timestamp = observation.timestamp ?? Date.now();
  if (observation.conversation_history) {
    normalizedObs.conversation_history = observation.conversation_history;
  }

  const environment = new RequestEnvironment(normalizedObs, toolRunner, {
    auditLogger,
    tenantId,
    requestId
  });

  const worldModel = new RuleBasedWorldModel();
  const selfModel = new SelfModel();
  const planner = new HeuristicPlanner(worldModel);

  const agent = new CognitiveAgent({
    environment,
    memoryManager: scopedMemoryManager,
    worldModel,
    selfModel,
    goalStack,
    planner,
    llmAdapter: container.resolve<LLMAdapter>('llmAdapter'),
    promptFilter: container.resolve<PromptInjectionFilter>('promptFilter'),
    outputValidator: container.resolve<OutputValidator<AgentDecision>>('outputValidator'),
    permissionGate: container.resolve<ToolPermissionGate>('permissionGate'),
    auditLogger,
    tenantId,
    requestId,
    dryRun: dryRun ?? false,
    multiActMaxSteps: maxMultiActSteps
  });

  if (obsStore) {
    obsStore.addRunStart(requestId, tenantId);
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Run timed out after ${runTimeoutMs / 1000}s`)),
      runTimeoutMs
    );
  });

  let result: AgentLoopResult;
  try {
    result = await Promise.race([agent.runOnce(), timeoutPromise]);
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const durationMs = Date.now() - runStartMs;

  if (obsStore) {
    const observationKeys = observation.state && typeof observation.state === 'object'
      ? Object.keys(observation.state)
      : [];
    obsStore.addRun({
      requestId,
      tenantId,
      timestamp: Date.now(),
      status: result.status,
      selectedGoalId: result.selectedGoalId,
      error: result.error,
      decision: result.decision,
      actionResult: result.actionResult,
      stateTrace: result.stateTrace,
      observationSummary: observationKeys,
      dryRunMode: result.dryRunMode,
      durationMs
    });
  }

  return { result, durationMs };
}
