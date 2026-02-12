/**
 * Pure helpers for the ernest-agent TUI. Exported for testing.
 */

export interface RunOnceResponse {
  status: 'completed' | 'idle' | 'dry_run' | 'error';
  decision?: { actionType: string; actionPayload?: Record<string, unknown>; confidence?: number; reasoning?: string };
  actionResult?: { success?: boolean; error?: string; skipped?: boolean };
  selectedGoalId?: string;
  error?: string;
  stateTrace?: string[];
  dryRunMode?: string;
  durationMs?: number;
}

export function extractAssistantContent(result: RunOnceResponse): string {
  const parts: string[] = [];
  if (result.decision?.actionPayload) {
    const payload = result.decision.actionPayload as Record<string, unknown>;
    for (const key of ['response', 'message', 'text', 'content', 'reply', 'answer']) {
      const val = payload[key];
      if (typeof val === 'string' && val.trim()) {
        parts.push(val);
        break;
      }
    }
  }
  if (result.decision?.reasoning && parts.length === 0) parts.push(result.decision.reasoning);
  if (result.actionResult?.error) parts.push(`Error: ${result.actionResult.error}`);
  return parts.join('\n').trim() || '(No response text)';
}

export function formatResult(result: RunOnceResponse): string {
  const lines: string[] = ['\n--- Result ---'];
  lines.push(`Status: ${result.status}`);
  if (result.error) lines.push(`Error: ${result.error}`);
  if (result.decision) {
    lines.push(`Decision: ${result.decision.actionType}`);
    if (result.decision.reasoning) lines.push(`Reasoning: ${result.decision.reasoning}`);
    if (result.decision.confidence !== undefined) lines.push(`Confidence: ${result.decision.confidence}`);
    const payload = result.decision.actionPayload as Record<string, unknown> | undefined;
    if (payload) {
      const responseKeys = ['response', 'message', 'text', 'content', 'reply', 'answer'];
      for (const key of responseKeys) {
        const val = payload[key];
        if (typeof val === 'string' && val.trim()) {
          lines.push('');
          lines.push(`Response: ${val}`);
          break;
        }
      }
      const hasResponseKey = responseKeys.some((k) => typeof payload[k] === 'string' && (payload[k] as string).trim());
      if (!hasResponseKey && Object.keys(payload).length > 0) {
        const str = JSON.stringify(payload);
        if (str.length > 2) lines.push(`Payload: ${str}`);
      }
    }
  }
  if (result.actionResult) {
    const ar = result.actionResult;
    if (ar.success !== undefined) lines.push(`Tool success: ${ar.success}`);
    if (ar.error) lines.push(`Tool error: ${ar.error}`);
    if (ar.skipped) lines.push('(Skipped - dry run)');
  }
  if (result.stateTrace?.length) lines.push(`Trace: ${result.stateTrace.join(' → ')}`);
  if (result.durationMs !== undefined) lines.push(`Duration: ${result.durationMs}ms`);
  return lines.join('\n');
}
