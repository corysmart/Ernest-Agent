import type { Environment } from '../env/environment';
import type { ActionResult, AgentAction, StateObservation } from '../env/types';
import type { SandboxedToolRunner } from '../security/sandboxed-tool-runner';
import type { StructuredAuditLogger } from '../security/audit-logger';

export class RequestEnvironment implements Environment {
  private readonly observation: StateObservation;
  private readonly toolRunner: SandboxedToolRunner;
  private readonly auditLogger?: StructuredAuditLogger;
  private readonly tenantId?: string;
  private readonly requestId?: string;

  constructor(
    observation: StateObservation,
    toolRunner: SandboxedToolRunner,
    options?: {
      auditLogger?: StructuredAuditLogger;
      tenantId?: string;
      requestId?: string;
    }
  ) {
    this.observation = observation;
    this.toolRunner = toolRunner;
    this.auditLogger = options?.auditLogger;
    this.tenantId = options?.tenantId;
    this.requestId = options?.requestId;
  }

  async observe(): Promise<StateObservation> {
    return this.observation;
  }

  async act(action: AgentAction): Promise<ActionResult> {
    try {
      const outputs = await this.toolRunner.run(action.type, action.payload ?? {});
      
      // Log successful tool call
      await this.auditLogger?.logToolCall({ // P2: Await async audit loggers
        tenantId: this.tenantId,
        requestId: this.requestId,
        toolName: action.type,
        input: action.payload ?? {},
        output: outputs,
        success: true
      });
      
      return { success: true, outputs };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Tool execution failed';
      
      // Log failed tool call
      await this.auditLogger?.logToolCall({ // P2: Await async audit loggers
        tenantId: this.tenantId,
        requestId: this.requestId,
        toolName: action.type,
        input: action.payload ?? {},
        success: false,
        error: errorMessage
      });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}
