export interface AuditLogEntry {
  timestamp: number;
  tenantId?: string;
  requestId?: string;
  eventType: 'agent_decision' | 'tool_call' | 'llm_request' | 'error';
  data: Record<string, unknown>;
}

export interface AuditLogger {
  log(entry: AuditLogEntry): void | Promise<void>;
}

export class ConsoleAuditLogger implements AuditLogger {
  log(entry: AuditLogEntry): void {
    const logLine = JSON.stringify({
      ...entry,
      timestamp: new Date(entry.timestamp).toISOString()
    });
    console.log(`[AUDIT] ${logLine}`);
  }
}

export class StructuredAuditLogger implements AuditLogger {
  constructor(private readonly logger: AuditLogger = new ConsoleAuditLogger()) {}

  logAgentDecision(params: {
    tenantId?: string;
    requestId?: string;
    decision: {
      actionType: string;
      actionPayload?: Record<string, unknown>;
      confidence?: number;
      reasoning?: string;
    };
    goalId?: string;
    stateTrace?: string[];
  }): void {
    this.logger.log({
      timestamp: Date.now(),
      tenantId: params.tenantId,
      requestId: params.requestId,
      eventType: 'agent_decision',
      data: {
        decision: params.decision,
        goalId: params.goalId,
        stateTrace: params.stateTrace
      }
    });
  }

  logToolCall(params: {
    tenantId?: string;
    requestId?: string;
    toolName: string;
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    success: boolean;
    error?: string;
  }): void {
    this.logger.log({
      timestamp: Date.now(),
      tenantId: params.tenantId,
      requestId: params.requestId,
      eventType: 'tool_call',
      data: {
        toolName: params.toolName,
        input: params.input,
        output: params.output,
        success: params.success,
        error: params.error
      }
    });
  }

  logLLMRequest(params: {
    tenantId?: string;
    requestId?: string;
    provider: string;
    model: string;
    tokensUsed?: number;
    success: boolean;
    error?: string;
  }): void {
    this.logger.log({
      timestamp: Date.now(),
      tenantId: params.tenantId,
      requestId: params.requestId,
      eventType: 'llm_request',
      data: {
        provider: params.provider,
        model: params.model,
        tokensUsed: params.tokensUsed,
        success: params.success,
        error: params.error
      }
    });
  }

  logError(params: {
    tenantId?: string;
    requestId?: string;
    error: string;
    context?: Record<string, unknown>;
  }): void {
    this.logger.log({
      timestamp: Date.now(),
      tenantId: params.tenantId,
      requestId: params.requestId,
      eventType: 'error',
      data: {
        error: params.error,
        context: params.context
      }
    });
  }

  log(entry: AuditLogEntry): void {
    this.logger.log(entry);
  }
}

