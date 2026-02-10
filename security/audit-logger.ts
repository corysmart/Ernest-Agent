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
 * Redacts sensitive patterns from a string.
 * Looks for common patterns like API keys, tokens, passwords, etc.
 */
function redactString(text: string, options: RedactionOptions = {}): string {
  const sensitiveFields = options.sensitiveFields
    ? [...DEFAULT_SENSITIVE_FIELDS, ...options.sensitiveFields]
    : DEFAULT_SENSITIVE_FIELDS;

  // Common patterns for secrets in text (API keys, tokens, etc.)
  // Match patterns like: "apiKey: sk-...", "token=abc123", "password: secret"
  let redacted = text;

  // Check for common secret patterns in the string
  for (const pattern of sensitiveFields) {
    const lowerPattern = pattern.toLowerCase();
    // Match patterns like "apikey: value", "token=value", "password: value", etc.
    const regex = new RegExp(`(${lowerPattern}\\s*[:=]\\s*)([^\\s,;}\\]\\)]+)`, 'gi');
    redacted = redacted.replace(regex, (match, prefix, value) => {
      // If value looks like a secret (long alphanumeric, contains dashes/underscores, etc.)
      if (value.length > 8 || /[-_]/i.test(value)) {
        return `${prefix}[REDACTED]`;
      }
      return match;
    });
  }

  // Also check for standalone secrets (long alphanumeric strings that might be tokens)
  // Match strings like "sk-1234567890abcdef" or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
  redacted = redacted.replace(/\b([a-zA-Z0-9_-]{20,})\b/g, (match) => {
    // If it looks like a token/key (long alphanumeric), redact it
    // But preserve common safe patterns like URLs, UUIDs in specific formats
    if (!match.match(/^https?:\/\//) && !match.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return '[REDACTED]';
    }
    return match;
  });

  return redacted;
}

/**
 * Redacts sensitive fields from an object recursively
 * P2: Uses visited set to detect and handle circular references
 */
function redactObject(obj: unknown, options: RedactionOptions = {}, visited: WeakSet<object> = new WeakSet()): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // P2: Check for circular references before processing
  if (visited.has(obj)) {
    return '[CIRCULAR]';
  }
  visited.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, options, visited));
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
    // P3: Use exact key matching (case-insensitive) instead of substring matching
    // This prevents 'id' from matching 'access_token_id' or 'id_token'
    if (allowlist && allowlist.length > 0) {
      const isAllowed = allowlist.some((allowed) => lowerKey === allowed.toLowerCase());
      if (!isAllowed) {
        continue;
      }
    }

    // Apply custom redaction function if provided
    if (redactFn) {
      const redactedValue = redactFn(key, value);
      // If value is an object, recursively redact it
      if (typeof redactedValue === 'object' && redactedValue !== null && !Array.isArray(redactedValue)) {
        result[key] = redactObject(redactedValue, options, visited);
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
      // Recursively redact nested objects (pass visited set to detect cycles)
      result[key] = redactObject(value, options, visited);
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

  async logAgentDecision(params: {
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
    /**
     * Optional redaction options for this specific decision log.
     * If not provided, uses default redaction options from constructor.
     */
    redactionOptions?: RedactionOptions;
  }): Promise<void> {
    // Use decision-specific redaction options or fall back to default
    const redactionOpts = params.redactionOptions ?? this.redactionOptions;

    // Redact sensitive fields from actionPayload and reasoning
    const redactedPayload = params.decision.actionPayload
      ? redactObject(params.decision.actionPayload, redactionOpts) as Record<string, unknown>
      : undefined;
    
    // Reasoning can be a string or object - redact sensitive data from both
    const redactedReasoning = params.decision.reasoning
      ? (typeof params.decision.reasoning === 'object'
          ? redactObject(params.decision.reasoning, redactionOpts)
          : redactString(String(params.decision.reasoning), redactionOpts))
      : undefined;

    const result = this.logger.log({
      timestamp: Date.now(),
      tenantId: params.tenantId,
      requestId: params.requestId,
      eventType: 'agent_decision',
      data: {
        decision: {
          actionType: params.decision.actionType,
          actionPayload: redactedPayload,
          confidence: params.decision.confidence,
          reasoning: redactedReasoning
        },
        goalId: params.goalId,
        stateTrace: params.stateTrace
      }
    });
    if (result instanceof Promise) {
      await result;
    }
  }

  async logToolCall(params: {
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
  }): Promise<void> {
    // Use tool-specific redaction options or fall back to default
    const redactionOpts = params.redactionOptions ?? this.redactionOptions;

    // Redact sensitive fields from input and output
    const redactedInput = redactObject(params.input, redactionOpts) as Record<string, unknown>;
    const redactedOutput = params.output ? redactObject(params.output, redactionOpts) as Record<string, unknown> : undefined;
    
    // P2: Redact error strings to prevent secrets from leaking into audit logs
    // Error messages can contain tokens, credentials, or PII from tool failures
    const redactedError = params.error ? redactString(params.error, redactionOpts) : undefined;

    const result = this.logger.log({
      timestamp: Date.now(),
      tenantId: params.tenantId,
      requestId: params.requestId,
      eventType: 'tool_call',
      data: {
        toolName: params.toolName,
        input: redactedInput,
        output: redactedOutput,
        success: params.success,
        error: redactedError
      }
    });
    // P2: Await async audit loggers to ensure logs are persisted
    if (result instanceof Promise) {
      await result;
    }
  }

  async logLLMRequest(params: {
    tenantId?: string;
    requestId?: string;
    provider: string;
    model: string;
    tokensUsed?: number;
    success: boolean;
    error?: string;
  }): Promise<void> {
    // P2: Redact error strings to prevent sensitive data from leaking into audit logs
    // Error messages can contain request URLs, tokens, headers, or other sensitive information
    const redactionOpts = this.redactionOptions;
    const redactedError = params.error ? redactString(params.error, redactionOpts) : undefined;
    
    const result = this.logger.log({
      timestamp: Date.now(),
      tenantId: params.tenantId,
      requestId: params.requestId,
      eventType: 'llm_request',
      data: {
        provider: params.provider,
        model: params.model,
        tokensUsed: params.tokensUsed,
        success: params.success,
        error: redactedError
      }
    });
    // P2: Await async audit loggers to ensure logs are persisted
    if (result instanceof Promise) {
      await result;
    }
  }

  async logError(params: {
    tenantId?: string;
    requestId?: string;
    error: string;
    context?: Record<string, unknown>;
    /**
     * Optional redaction options for this specific error log.
     * If not provided, uses default redaction options from constructor.
     */
    redactionOptions?: RedactionOptions;
  }): Promise<void> {
    // Use error-specific redaction options or fall back to default
    const redactionOpts = params.redactionOptions ?? this.redactionOptions;

    // P2: Redact sensitive data from error strings
    // Error messages can contain secrets, API keys, or other sensitive information
    const redactedError = redactString(params.error, redactionOpts);

    // Redact sensitive fields from context
    const redactedContext = params.context ? redactObject(params.context, redactionOpts) as Record<string, unknown> : undefined;

    const result = this.logger.log({
      timestamp: Date.now(),
      tenantId: params.tenantId,
      requestId: params.requestId,
      eventType: 'error',
      data: {
        error: redactedError,
        context: redactedContext
      }
    });
    if (result instanceof Promise) {
      await result;
    }
  }

  async log(entry: AuditLogEntry): Promise<void> {
    // P2: Await async audit loggers to ensure logs are persisted
    // Network loggers (e.g., sending to external service) need to be awaited
    // to prevent log loss if the process exits before the async operation completes
    const result = this.logger.log(entry);
    if (result instanceof Promise) {
      await result;
    }
  }
}

