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

export interface RedactionOptions {
  /**
   * Fields to redact (case-insensitive partial match).
   * Default: ['password', 'secret', 'apikey', 'token', 'key', 'credential', 'auth']
   */
  sensitiveFields?: string[];
  /**
   * Fields to allow (case-insensitive). If specified, only these fields are logged.
   * Useful for tools that should only log specific safe fields.
   */
  allowlist?: string[];
  /**
   * Custom redaction function. If provided, this takes precedence over default redaction.
   */
  redactFn?: (key: string, value: unknown) => unknown;
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

/**
 * Default sensitive field patterns (case-insensitive partial match)
 */
const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'secret',
  'apikey',
  'api_key',
  'token',
  'access_token',
  'refresh_token',
  'key',
  'credential',
  'auth',
  'authorization',
  'bearer',
  'session',
  'cookie',
  'ssn',
  'social_security',
  'credit_card',
  'card_number',
  'pin',
  'pii'
];

/**
 * Redacts sensitive fields from an object recursively
 */
function redactObject(obj: unknown, options: RedactionOptions = {}): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, options));
  }

  // Merge custom sensitive fields with defaults (custom fields take precedence for duplicates)
  const sensitiveFields = options.sensitiveFields
    ? [...DEFAULT_SENSITIVE_FIELDS, ...options.sensitiveFields]
    : DEFAULT_SENSITIVE_FIELDS;
  const allowlist = options.allowlist;
  const redactFn = options.redactFn;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    // If allowlist is specified, only include allowed fields
    if (allowlist && allowlist.length > 0) {
      const isAllowed = allowlist.some((allowed) => lowerKey.includes(allowed.toLowerCase()));
      if (!isAllowed) {
        continue;
      }
    }

    // Apply custom redaction function if provided
    if (redactFn) {
      const redactedValue = redactFn(key, value);
      // If value is an object, recursively redact it
      if (typeof redactedValue === 'object' && redactedValue !== null && !Array.isArray(redactedValue)) {
        result[key] = redactObject(redactedValue, options);
      } else {
        result[key] = redactedValue;
      }
      continue;
    }

    // Check if field matches sensitive patterns
    const isSensitive = sensitiveFields.some((pattern) => lowerKey.includes(pattern.toLowerCase()));

    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      // Recursively redact nested objects
      result[key] = redactObject(value, options);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export class StructuredAuditLogger implements AuditLogger {
  constructor(
    private readonly logger: AuditLogger = new ConsoleAuditLogger(),
    private readonly redactionOptions: RedactionOptions = {}
  ) {}

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
    /**
     * Optional redaction options for this specific tool call.
     * If not provided, uses default redaction options from constructor.
     */
    redactionOptions?: RedactionOptions;
  }): void {
    // Use tool-specific redaction options or fall back to default
    const redactionOpts = params.redactionOptions ?? this.redactionOptions;

    // Redact sensitive fields from input and output
    const redactedInput = redactObject(params.input, redactionOpts) as Record<string, unknown>;
    const redactedOutput = params.output ? redactObject(params.output, redactionOpts) as Record<string, unknown> : undefined;

    this.logger.log({
      timestamp: Date.now(),
      tenantId: params.tenantId,
      requestId: params.requestId,
      eventType: 'tool_call',
      data: {
        toolName: params.toolName,
        input: redactedInput,
        output: redactedOutput,
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
    /**
     * Optional redaction options for this specific error log.
     * If not provided, uses default redaction options from constructor.
     */
    redactionOptions?: RedactionOptions;
  }): void {
    // Use error-specific redaction options or fall back to default
    const redactionOpts = params.redactionOptions ?? this.redactionOptions;

    // Redact sensitive fields from context
    const redactedContext = params.context ? redactObject(params.context, redactionOpts) as Record<string, unknown> : undefined;

    this.logger.log({
      timestamp: Date.now(),
      tenantId: params.tenantId,
      requestId: params.requestId,
      eventType: 'error',
      data: {
        error: params.error,
        context: redactedContext
      }
    });
  }

  log(entry: AuditLogEntry): void {
    this.logger.log(entry);
  }
}

