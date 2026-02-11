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
      
      // P2: Log successful tool call - isolate logging errors from tool execution
      // Logging failures should not affect tool outcome
      try {
        await this.auditLogger?.logToolCall({
          tenantId: this.tenantId,
          requestId: this.requestId,
          toolName: action.type,
          input: action.payload ?? {},
          output: outputs,
          success: true
        });
      } catch (logError) {
        // P2: Logging failures should not change tool outcome
        console.error(`[ERROR] Failed to log tool call: ${logError instanceof Error ? logError.message : String(logError)}`);
      }
      
      return { success: true, outputs };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Tool execution failed';
      
      // P2: Log failed tool call - isolate logging errors from tool execution
      try {
        await this.auditLogger?.logToolCall({
          tenantId: this.tenantId,
          requestId: this.requestId,
          toolName: action.type,
          input: action.payload ?? {},
          success: false,
          error: errorMessage
        });
      } catch (logError) {
        // P2: Logging failures should not affect error reporting
        console.error(`[ERROR] Failed to log tool call error: ${logError instanceof Error ? logError.message : String(logError)}`);
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}
