import type { AgentAction } from '../../env/types';

export interface PromptInjectionFilter {
  sanitize(input: string): { sanitized: string; flagged: boolean; reasons: string[] };
}

export interface OutputValidator<T> {
  validate(output: string): { success: boolean; data?: T; errors?: string[] };
}

export interface ToolPermissionGate {
  isAllowed(action: AgentAction, context?: { goalId?: string }): { allowed: boolean; reason?: string };
}
