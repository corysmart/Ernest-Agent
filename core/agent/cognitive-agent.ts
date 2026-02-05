import { randomUUID } from 'crypto';
import type { LLMAdapter, PromptRequest } from '../contracts/llm';
import type { PromptInjectionFilter, OutputValidator, ToolPermissionGate } from '../contracts/security';
import type { AgentDecision, AgentLoopResult, AgentState } from '../contracts/agent';
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
}

export class CognitiveAgent {
  constructor(private readonly options: CognitiveAgentOptions) {}

  async runOnce(): Promise<AgentLoopResult> {
    const stateTrace: AgentState[] = [];
    const transition = (state: AgentState) => {
      stateTrace.push(state);
    };

    try {
      transition('observe');
      const observation = await this.options.environment.observe();
      transition('retrieve_memory');
      const sanitized = this.options.promptFilter.sanitize(JSON.stringify(observation));
      
      // Act on prompt injection detection
      if (sanitized.flagged) {
        this.options.auditLogger?.logError({
          tenantId: this.options.tenantId,
          requestId: this.options.requestId,
          error: 'Prompt injection detected',
          context: {
            reasons: sanitized.reasons,
            flagged: true
          }
        });
        
        // Block execution when prompt injection is detected
        transition('error');
        return {
          status: 'error',
          error: `Prompt injection detected: ${sanitized.reasons.join('; ')}`,
          stateTrace
        };
      }
      
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
      const worldState = this.options.worldModel.update(observation);
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

      this.options.planner.plan(goal, {
        worldState,
        self: selfSnapshot,
        candidateActions
      });

      transition('query_llm');
      const systemPrompt = buildSystemPrompt({
        memoryContext,
        worldState,
        selfSnapshot,
        goal
      });
      const userPrompt = sanitized.sanitized;

      const request: PromptRequest = {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        maxTokens: 512,
        temperature: 0.2
      };

      // Log LLM request
      const llmProvider = this.options.llmAdapter.constructor.name.replace('Adapter', '').toLowerCase();
      let response;
      try {
        response = await this.options.llmAdapter.generate(request);
        
        // Log successful LLM request
        this.options.auditLogger?.logLLMRequest({
          tenantId: this.options.tenantId,
          requestId: this.options.requestId,
          provider: llmProvider,
          model: 'unknown', // Adapters don't expose model name easily
          tokensUsed: response.tokensUsed,
          success: true
        });
      } catch (llmError) {
        // Log LLM request failure
        this.options.auditLogger?.logLLMRequest({
          tenantId: this.options.tenantId,
          requestId: this.options.requestId,
          provider: llmProvider,
          model: 'unknown',
          success: false,
          error: llmError instanceof Error ? llmError.message : 'Unknown error'
        });
        throw llmError;
      }

      transition('validate_output');
      const validated = this.options.outputValidator.validate(response.content);

      if (!validated.success || !validated.data) {
        transition('error');
        return { status: 'error', error: `Invalid LLM output: ${(validated.errors ?? []).join('; ')}`, stateTrace };
      }

      const decision = validated.data;
      if (!decision.actionType) {
        transition('error');
        return { status: 'error', error: 'Decision missing actionType', stateTrace };
      }

      // Log agent decision
      this.options.auditLogger?.logAgentDecision({
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

      const action = { type: decision.actionType, payload: decision.actionPayload };
      const permission = this.options.permissionGate.isAllowed(action, { goalId: goal.id });
      if (!permission.allowed) {
        transition('error');
        return { status: 'error', error: permission.reason ?? 'Action not permitted', stateTrace };
      }

      transition('act');
      const actionResult = await this.options.environment.act(action);
      this.options.worldModel.updateFromResult(worldState, { success: actionResult.success, observation: actionResult.observation });

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
      this.options.auditLogger?.logError({
        tenantId: this.options.tenantId,
        requestId: this.options.requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        context: { stateTrace }
      });
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
}): string {
  const parts = [
    'You are an agent that must output a JSON object with keys: actionType, actionPayload, confidence, reasoning.',
    `Goal: ${args.goal.title}${args.goal.description ? ` - ${args.goal.description}` : ''}`,
    `WorldState: ${JSON.stringify(args.worldState)}`,
    `SelfModel: ${JSON.stringify(args.selfSnapshot)}`
  ];

  if (args.memoryContext) {
    parts.push(`Memory:\n${args.memoryContext}`);
  }

  return parts.join('\n');
}
