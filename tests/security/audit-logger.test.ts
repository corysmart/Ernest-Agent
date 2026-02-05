import { StructuredAuditLogger } from '../../security/audit-logger';
import type { AuditLogger, AuditLogEntry } from '../../security/audit-logger';

describe('Audit Logger', () => {
  let logger: StructuredAuditLogger;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    logger = new StructuredAuditLogger();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('logs agent decisions with all fields', () => {
    logger.logAgentDecision({
      tenantId: 'tenant-123',
      requestId: 'req-456',
      decision: {
        actionType: 'pursue_goal',
        actionPayload: { goalId: 'goal-1' },
        confidence: 0.85,
        reasoning: 'High confidence based on context'
      },
      goalId: 'goal-1',
      stateTrace: ['observe', 'plan_goals', 'query_llm']
    });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logCall = consoleLogSpy.mock.calls[0]![0] as string;
    expect(logCall).toContain('[AUDIT]');
    const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
    expect(logData.eventType).toBe('agent_decision');
    expect(logData.tenantId).toBe('tenant-123');
    expect(logData.requestId).toBe('req-456');
    expect(logData.data.decision.actionType).toBe('pursue_goal');
    expect(logData.data.decision.confidence).toBe(0.85);
    expect(logData.data.goalId).toBe('goal-1');
  });

  it('logs tool calls with success', () => {
    logger.logToolCall({
      tenantId: 'tenant-123',
      requestId: 'req-456',
      toolName: 'pursue_goal',
      input: { goalId: 'goal-1' },
      output: { acknowledged: true },
      success: true
    });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logCall = consoleLogSpy.mock.calls[0]![0] as string;
    const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
    expect(logData.eventType).toBe('tool_call');
    expect(logData.data.toolName).toBe('pursue_goal');
    expect(logData.data.success).toBe(true);
    expect(logData.data.output).toEqual({ acknowledged: true });
  });

  it('logs tool calls with failure', () => {
    logger.logToolCall({
      tenantId: 'tenant-123',
      requestId: 'req-456',
      toolName: 'invalid_tool',
      input: {},
      success: false,
      error: 'Tool not found'
    });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logCall = consoleLogSpy.mock.calls[0]![0] as string;
    const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
    expect(logData.eventType).toBe('tool_call');
    expect(logData.data.success).toBe(false);
    expect(logData.data.error).toBe('Tool not found');
  });

  it('logs LLM requests with success', () => {
    logger.logLLMRequest({
      tenantId: 'tenant-123',
      requestId: 'req-456',
      provider: 'openai',
      model: 'gpt-4',
      tokensUsed: 150,
      success: true
    });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logCall = consoleLogSpy.mock.calls[0]![0] as string;
    const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
    expect(logData.eventType).toBe('llm_request');
    expect(logData.data.provider).toBe('openai');
    expect(logData.data.model).toBe('gpt-4');
    expect(logData.data.tokensUsed).toBe(150);
    expect(logData.data.success).toBe(true);
  });

  it('logs LLM requests with failure', () => {
    logger.logLLMRequest({
      tenantId: 'tenant-123',
      requestId: 'req-456',
      provider: 'openai',
      model: 'gpt-4',
      success: false,
      error: 'API rate limit exceeded'
    });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logCall = consoleLogSpy.mock.calls[0]![0] as string;
    const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
    expect(logData.eventType).toBe('llm_request');
    expect(logData.data.success).toBe(false);
    expect(logData.data.error).toBe('API rate limit exceeded');
  });

  it('logs errors with context', () => {
    logger.logError({
      tenantId: 'tenant-123',
      requestId: 'req-456',
      error: 'Validation failed',
      context: { field: 'actionType', value: null }
    });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logCall = consoleLogSpy.mock.calls[0]![0] as string;
    const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
    expect(logData.eventType).toBe('error');
    expect(logData.data.error).toBe('Validation failed');
    expect(logData.data.context).toEqual({ field: 'actionType', value: null });
  });

  it('handles optional tenantId and requestId', () => {
    logger.logAgentDecision({
      decision: {
        actionType: 'pursue_goal',
        actionPayload: {}
      },
      goalId: 'goal-1'
    });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logCall = consoleLogSpy.mock.calls[0]![0] as string;
    const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
    expect(logData.tenantId).toBeUndefined();
    expect(logData.requestId).toBeUndefined();
  });

  it('includes ISO timestamp', () => {
    const beforeTime = Date.now();
    logger.logAgentDecision({
      decision: {
        actionType: 'pursue_goal',
        actionPayload: {}
      },
      goalId: 'goal-1'
    });
    const afterTime = Date.now();

    const logCall = consoleLogSpy.mock.calls[0]![0] as string;
    const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
    const timestamp = new Date(logData.timestamp).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
    expect(timestamp).toBeLessThanOrEqual(afterTime);
  });

  describe('P2: Sensitive data redaction', () => {
    it('redacts sensitive fields from tool call input', () => {
      logger.logToolCall({
        tenantId: 'tenant-123',
        requestId: 'req-456',
        toolName: 'api_call',
        input: {
          apiKey: 'secret-key-123',
          password: 'mypassword',
          goalId: 'goal-1',
          safeField: 'safe-value'
        },
        success: true
      });

      const logCall = consoleLogSpy.mock.calls[0]![0] as string;
      const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
      expect(logData.data.input.apiKey).toBe('[REDACTED]');
      expect(logData.data.input.password).toBe('[REDACTED]');
      expect(logData.data.input.goalId).toBe('goal-1');
      expect(logData.data.input.safeField).toBe('safe-value');
    });

    it('redacts sensitive fields from tool call output', () => {
      logger.logToolCall({
        tenantId: 'tenant-123',
        requestId: 'req-456',
        toolName: 'api_call',
        input: { goalId: 'goal-1' },
        output: {
          access_token: 'token-123',
          secret: 'my-secret',
          result: 'success'
        },
        success: true
      });

      const logCall = consoleLogSpy.mock.calls[0]![0] as string;
      const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
      expect(logData.data.output.access_token).toBe('[REDACTED]');
      expect(logData.data.output.secret).toBe('[REDACTED]');
      expect(logData.data.output.result).toBe('success');
    });

    it('redacts nested sensitive fields', () => {
      logger.logToolCall({
        tenantId: 'tenant-123',
        requestId: 'req-456',
        toolName: 'api_call',
        input: {
          config: {
            apiKey: 'secret-key',
            endpoint: 'https://api.example.com'
          },
          safeData: 'value'
        },
        success: true
      });

      const logCall = consoleLogSpy.mock.calls[0]![0] as string;
      const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
      expect(logData.data.input.config.apiKey).toBe('[REDACTED]');
      expect(logData.data.input.config.endpoint).toBe('https://api.example.com');
      expect(logData.data.input.safeData).toBe('value');
    });

    it('supports field allowlist for tool calls', () => {
      logger.logToolCall({
        tenantId: 'tenant-123',
        requestId: 'req-456',
        toolName: 'api_call',
        input: {
          apiKey: 'secret-key',
          goalId: 'goal-1',
          otherField: 'value'
        },
        success: true,
        redactionOptions: {
          allowlist: ['goalId']
        }
      });

      const logCall = consoleLogSpy.mock.calls[0]![0] as string;
      const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
      // Only goalId should be logged (allowlist)
      expect(logData.data.input.goalId).toBe('goal-1');
      expect(logData.data.input.apiKey).toBeUndefined();
      expect(logData.data.input.otherField).toBeUndefined();
    });

    it('redacts sensitive fields from error context', () => {
      logger.logError({
        tenantId: 'tenant-123',
        requestId: 'req-456',
        error: 'API call failed',
        context: {
          password: 'secret-password',
          errorCode: '500',
          apiKey: 'key-123'
        }
      });

      const logCall = consoleLogSpy.mock.calls[0]![0] as string;
      const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
      expect(logData.data.context.password).toBe('[REDACTED]');
      expect(logData.data.context.apiKey).toBe('[REDACTED]');
      expect(logData.data.context.errorCode).toBe('500');
    });

    it('supports custom redaction function', () => {
      logger.logToolCall({
        tenantId: 'tenant-123',
        requestId: 'req-456',
        toolName: 'api_call',
        input: {
          customField: 'value',
          otherField: 'other'
        },
        success: true,
        redactionOptions: {
          redactFn: (key, value) => {
            if (key === 'customField') {
              return '[CUSTOM_REDACTED]';
            }
            return value;
          }
        }
      });

      const logCall = consoleLogSpy.mock.calls[0]![0] as string;
      const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
      expect(logData.data.input.customField).toBe('[CUSTOM_REDACTED]');
      expect(logData.data.input.otherField).toBe('other');
    });

    it('uses default redaction options from constructor', () => {
      const customLogger = new (class implements AuditLogger {
        log(entry: AuditLogEntry): void {
          console.log(`[AUDIT] ${JSON.stringify(entry)}`);
        }
      })();
      
      const loggerWithDefaults = new StructuredAuditLogger(
        customLogger,
        { sensitiveFields: ['custom'] }
      );

      loggerWithDefaults.logToolCall({
        tenantId: 'tenant-123',
        requestId: 'req-456',
        toolName: 'api_call',
        input: {
          custom: 'should-be-redacted',
          apiKey: 'should-be-redacted',
          safe: 'safe-value'
        },
        success: true
      });

      const logCall = consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1]![0] as string;
      const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
      // 'custom' should be redacted (from constructor options)
      expect(logData.data.input.custom).toBe('[REDACTED]');
      // 'apiKey' should also be redacted (from default patterns)
      expect(logData.data.input.apiKey).toBe('[REDACTED]');
      expect(logData.data.input.safe).toBe('safe-value');
    });

    it('redacts sensitive fields from agent decision actionPayload', () => {
      logger.logAgentDecision({
        tenantId: 'tenant-123',
        requestId: 'req-456',
        decision: {
          actionType: 'api_call',
          actionPayload: {
            apiKey: 'secret-key-123',
            password: 'mypassword',
            goalId: 'goal-1',
            safeField: 'safe-value'
          },
          confidence: 0.9
        },
        goalId: 'goal-1'
      });

      const logCall = consoleLogSpy.mock.calls[0]![0] as string;
      const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
      expect(logData.data.decision.actionPayload.apiKey).toBe('[REDACTED]');
      expect(logData.data.decision.actionPayload.password).toBe('[REDACTED]');
      expect(logData.data.decision.actionPayload.goalId).toBe('goal-1');
      expect(logData.data.decision.actionPayload.safeField).toBe('safe-value');
    });

    it('preserves reasoning string when it does not contain sensitive data', () => {
      logger.logAgentDecision({
        tenantId: 'tenant-123',
        requestId: 'req-456',
        decision: {
          actionType: 'pursue_goal',
          reasoning: 'This is a safe reasoning string'
        },
        goalId: 'goal-1'
      });

      const logCall = consoleLogSpy.mock.calls[0]![0] as string;
      const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
      expect(logData.data.decision.reasoning).toBe('This is a safe reasoning string');
    });

    it('P2: redacts sensitive patterns from reasoning strings', () => {
      logger.logAgentDecision({
        tenantId: 'tenant-123',
        requestId: 'req-456',
        decision: {
          actionType: 'api_call',
          reasoning: 'Using apiKey: sk-1234567890abcdef to authenticate. Token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
        },
        goalId: 'goal-1'
      });

      const logCall = consoleLogSpy.mock.calls[0]![0] as string;
      const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
      const reasoning = logData.data.decision.reasoning as string;
      // Should redact API keys and tokens
      expect(reasoning).toContain('[REDACTED]');
      expect(reasoning).not.toContain('sk-1234567890abcdef');
      expect(reasoning).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('P2: redacts long alphanumeric strings that look like tokens from reasoning', () => {
      logger.logAgentDecision({
        tenantId: 'tenant-123',
        requestId: 'req-456',
        decision: {
          actionType: 'api_call',
          reasoning: 'The authentication token is abc123def456ghi789jkl012mno345pqr678'
        },
        goalId: 'goal-1'
      });

      const logCall = consoleLogSpy.mock.calls[0]![0] as string;
      const logData = JSON.parse(logCall.replace('[AUDIT] ', ''));
      const reasoning = logData.data.decision.reasoning as string;
      // Should redact long token-like strings
      expect(reasoning).toContain('[REDACTED]');
      expect(reasoning).not.toContain('abc123def456ghi789jkl012mno345pqr678');
    });
  });
});

