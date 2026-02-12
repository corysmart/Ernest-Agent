import { randomUUID } from 'crypto';
import type { LLMAdapter, PromptRequest } from '../contracts/llm';
import type { PromptInjectionFilter, OutputValidator, ToolPermissionGate } from '../contracts/security';
import type { AgentDecision, AgentLoopResult, AgentState, DryRunMode } from '../contracts/agent';
import type { Environment } from '../../env/environment';
import type { IMemoryManager } from '../../memory/memory-manager';
import type { WorldModel } from '../../world/world-model';
import type { GoalStack } from '../../goals/goal-stack';
import type { Planner } from '../../goals/planner';
import type { SelfModel } from '../../self/self-model';
import type { GoalReference } from '../../memory/types';
import type { StructuredAuditLogger } from '../../security/audit-logger';

interface CognitiveAgentOptions {
  environment: Environment;
  memoryManager: IMemoryManager;
  worldModel: WorldModel;
  selfModel: SelfModel;
  goalStack: GoalStack;
  planner: Planner;
  llmAdapter: LLMAdapter;
  promptFilter: PromptInjectionFilter;
  outputValidator: OutputValidator<AgentDecision>;
  permissionGate: ToolPermissionGate;
  auditLogger?: StructuredAuditLogger;
  tenantId?: string;
  requestId?: string;
  /** When set, skips act/memory/self-model. with-llm: calls LLM; without-llm: skips LLM, uses stub decision. */
  dryRun?: false | DryRunMode;
}

export class CognitiveAgent {
  constructor(private readonly options: CognitiveAgentOptions) {}

  async runOnce(): Promise<AgentLoopResult> {
    const stateTrace: AgentState[] = [];
    const transition = (state: AgentState) => {
      stateTrace.push(state);
      void this.options.auditLogger?.logRunProgress?.({
        tenantId: this.options.tenantId,
        requestId: this.options.requestId,
        state,
        stateTrace: [...stateTrace]
      });
    };

    try {
      transition('observe');
      const observation = await this.options.environment.observe();
      transition('retrieve_memory');
      const sanitized = this.options.promptFilter.sanitize(JSON.stringify(observation));
      
      // P2: Act on prompt injection detection - block execution and log
      if (sanitized.flagged) {
        // P2: Log error - best-effort, don't break agent flow
        try {
          await this.options.auditLogger?.logError({
            tenantId: this.options.tenantId,
            requestId: this.options.requestId,
            error: 'Prompt injection detected',
            context: {
              reasons: sanitized.reasons,
              flagged: true
            }
          });
        } catch (logError) {
          // P2: Audit logging failures should not break agent flow
          console.error(`[ERROR] Failed to log prompt injection error: ${logError instanceof Error ? logError.message : String(logError)}`);
        }
        
        // Block execution when prompt injection is detected - do not proceed with flagged input
        transition('error');
        return {
          status: 'error',
          error: `Prompt injection detected: ${sanitized.reasons.join('; ')}`,
          stateTrace
        };
      }
      
      // Only proceed with memory retrieval if input is not flagged
      const goals = this.options.goalStack.listGoals();
      const goalRefs: GoalReference[] = goals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        priority: goal.priority
      }));
      const memoryContext = await this.options.memoryManager.injectForPrompt({
        text: sanitized.sanitized,
        limit: 5,
        goals: goalRefs
      });

            transition('update_world');
            let worldState = this.options.worldModel.update(observation);
      transition('update_self');
      const selfSnapshot = this.options.selfModel.snapshot();

      transition('plan_goals');
      const goal = this.options.goalStack.resolveNextGoal();
      if (!goal) {
        return { status: 'idle', stateTrace };
      }

      transition('simulate');
      const candidateActions = goal.candidateActions?.length
        ? goal.candidateActions.map((action) => ({ type: action.type, payload: action.payload }))
        : [{ type: 'pursue_goal', payload: { goalId: goal.id } }];

      // P2: Use planner output - store plan as procedural memory and include in prompt
      const plan = this.options.planner.plan(goal, {
        worldState,
        self: selfSnapshot,
        candidateActions
      });

      // Store plan as procedural memory for future reference (skipped in dry run)
      const dryRun = this.options.dryRun;
      if (plan.steps && plan.steps.length > 0 && !dryRun) {
        await this.options.memoryManager.addProcedural({
          id: randomUUID(),
          type: 'procedural',
          content: `Plan for goal ${goal.id}: ${plan.steps.map((step) => step.description).join('; ')}`,
          createdAt: Date.now(),
          planSummary: plan.steps.map((step) => step.description).join('; '),
          successRate: 0.5 // Initial success rate
        });
      }

      let decision: AgentDecision;
      if (dryRun === 'without-llm') {
        transition('validate_output');
        decision = {
          actionType: candidateActions[0]?.type ?? 'pursue_goal',
          actionPayload: candidateActions[0]?.payload ?? { goalId: goal.id },
          confidence: 1,
          reasoning: 'Dry run (no LLM)'
        };
      } else {
        transition('query_llm');
        const allowedTypes = this.options.permissionGate.getAllowedTypes?.() ?? null;
        const systemPrompt = buildSystemPrompt({
          memoryContext,
          worldState,
          selfSnapshot,
          goal,
          plan,
          promptFilter: this.options.promptFilter,
          allowedActionTypes: allowedTypes ?? undefined
        });
        const llmProvider = this.options.llmAdapter.constructor.name.replace('Adapter', '').toLowerCase();
        const MAX_LLM_RETRIES = 2;
        let llmDecision: AgentDecision | null = null;

        for (let attempt = 0; attempt < MAX_LLM_RETRIES; attempt += 1) {
          const userPrompt = attempt === 0
            ? sanitized.sanitized
            : `${sanitized.sanitized}\n\n[Your previous response was invalid JSON. Output ONLY a valid JSON object—no markdown, no explanation. Example: {"actionType":"pursue_goal","actionPayload":{},"confidence":0.9,"reasoning":"..."}]`;

          const request: PromptRequest = {
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            maxTokens: 512,
            temperature: attempt > 0 ? 0.1 : 0.2
          };

          let response;
          try {
            response = await this.options.llmAdapter.generate(request);
            try {
              await this.options.auditLogger?.logLLMRequest({
                tenantId: this.options.tenantId, requestId: this.options.requestId,
                provider: llmProvider, model: 'unknown', tokensUsed: response.tokensUsed, success: true
              });
            } catch (logError) {
              console.error(`[ERROR] Failed to log LLM request: ${logError instanceof Error ? logError.message : String(logError)}`);
            }
          } catch (llmError) {
            try {
              await this.options.auditLogger?.logLLMRequest({
                tenantId: this.options.tenantId, requestId: this.options.requestId,
                provider: llmProvider, model: 'unknown', success: false,
                error: llmError instanceof Error ? llmError.message : 'Unknown error'
              });
            } catch (logError) {
              console.error(`[ERROR] Failed to log LLM request error: ${logError instanceof Error ? logError.message : String(logError)}`);
            }
            throw llmError;
          }

          transition('validate_output');
          const validated = this.options.outputValidator.validate(response.content);
          if (validated.success && validated.data) {
            llmDecision = validated.data;
            break;
          }
          if (attempt === MAX_LLM_RETRIES - 1) {
            transition('error');
            return { status: 'error', error: `Invalid LLM output: ${(validated.errors ?? []).join('; ')}`, stateTrace };
          }
        }

        if (!llmDecision?.actionType) {
          transition('error');
          return { status: 'error', error: 'Decision missing actionType', stateTrace };
        }
        decision = llmDecision;
      }

      // P2: Log agent decision - best-effort, don't break agent flow
      try {
        await this.options.auditLogger?.logAgentDecision({
          tenantId: this.options.tenantId,
          requestId: this.options.requestId,
          decision: {
            actionType: decision.actionType,
            actionPayload: decision.actionPayload,
            confidence: decision.confidence,
            reasoning: decision.reasoning
          },
          goalId: goal.id,
          stateTrace
        });
      } catch (logError) {
        // P2: Audit logging failures should not break agent flow
        // Log error but continue execution
        console.error(`[ERROR] Failed to log agent decision: ${logError instanceof Error ? logError.message : String(logError)}`);
      }

      const action = { type: decision.actionType, payload: decision.actionPayload };
      const permission = this.options.permissionGate.isAllowed(action, { goalId: goal.id });
      if (!permission.allowed) {
        transition('error');
        return { status: 'error', error: permission.reason ?? 'Action not permitted', stateTrace };
      }

      if (dryRun) {
        transition('complete');
        return {
          status: 'dry_run',
          decision,
          actionResult: { success: true, skipped: true },
          selectedGoalId: goal.id,
          stateTrace,
          dryRunMode: dryRun
        };
      }

      transition('act');
      const actionResult = await this.options.environment.act(action);
      // P2: Assign returned state to keep world model synchronized
      // This ensures the world model state is updated even when no observation is provided
      worldState = this.options.worldModel.updateFromResult(worldState, { success: actionResult.success, observation: actionResult.observation });

      transition('store_results');
      await this.options.memoryManager.addEpisodic({
        id: randomUUID(),
        type: 'episodic',
        content: `Action ${action.type} => ${actionResult.success ? 'success' : 'failure'}`,
        createdAt: Date.now(),
        eventType: 'action_result'
      });

      transition('learn');
      this.options.selfModel.recordOutcome(actionResult.success);
      this.options.goalStack.updateStatus(goal.id, actionResult.success ? 'completed' : 'failed');

      transition('complete');
      return {
        status: 'completed',
        decision,
        actionResult: { success: actionResult.success, error: actionResult.error },
        selectedGoalId: goal.id,
        stateTrace
      };
    } catch (error) {
      transition('error');
      // P2: Log error - best-effort, don't break agent flow
      try {
        await this.options.auditLogger?.logError({
          tenantId: this.options.tenantId,
          requestId: this.options.requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
          context: { stateTrace }
        });
      } catch (logError) {
        // P2: Audit logging failures should not break agent flow
        console.error(`[ERROR] Failed to log agent error: ${logError instanceof Error ? logError.message : String(logError)}`);
      }
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        stateTrace
      };
    }
  }
}

function buildSystemPrompt(args: {
  memoryContext: string;
  worldState: unknown;
  selfSnapshot: unknown;
  goal: { title: string; description?: string };
  plan?: { steps: Array<{ description: string }> };
  promptFilter: PromptInjectionFilter;
  allowedActionTypes?: string[];
}): string {
  // P2: Sanitize goal/memory content before including in system prompt
  // This prevents prompt injection via user-supplied goals or poisoned memory
  const sanitizedGoalTitle = args.promptFilter.sanitize(args.goal.title).sanitized;
  const sanitizedGoalDesc = args.goal.description ? args.promptFilter.sanitize(args.goal.description).sanitized : undefined;
  const sanitizedMemoryContext = args.memoryContext ? args.promptFilter.sanitize(args.memoryContext).sanitized : '';

  const parts = [
    'You are an agent. Your response must be ONLY a valid JSON object—no other text, no markdown, no explanation. The system parses your output with JSON.parse(); any non-JSON text will cause a failure.',
    `Goal: ${sanitizedGoalTitle}${sanitizedGoalDesc ? ` - ${sanitizedGoalDesc}` : ''}`,
    `WorldState: ${JSON.stringify(args.worldState)}`,
    `SelfModel: ${JSON.stringify(args.selfSnapshot)}`
  ];

  if (args.allowedActionTypes && args.allowedActionTypes.length > 0) {
    parts.push(`actionType must be exactly one of: ${args.allowedActionTypes.join(', ')}.`);
  }

  // Include plan if available
  if (args.plan && args.plan.steps && args.plan.steps.length > 0) {
    const planDescription = args.plan.steps.map((step) => step.description).join('; ');
    const sanitizedPlan = args.promptFilter.sanitize(planDescription).sanitized;
    parts.push(`Plan: ${sanitizedPlan}`);
  }

  if (sanitizedMemoryContext) {
    parts.push(`Memory:\n${sanitizedMemoryContext}`);
  }

  const isRespondGoal = /respond\s+to\s+user/i.test(sanitizedGoalTitle);
  if (isRespondGoal) {
    parts.push('Put your direct reply to the user in actionPayload.response. Use actionType pursue_goal.');
    parts.push('Example: {"actionType":"pursue_goal","actionPayload":{"response":"Your actual reply text here."},"confidence":0.9,"reasoning":"Brief explanation"}');
  }
  parts.push(
    'Response format: {"actionType":"<one of allowed types>","actionPayload":{},"confidence":<0-1>,"reasoning":"<optional>"}',
    'Output ONLY the JSON object. Nothing before it, nothing after.'
  );

  return parts.join('\n');
}
