/**
 * Normalizes run errors for observability display.
 * Detects usage-limit errors (e.g. Codex/LLM provider) and extracts a user-friendly message
 * instead of the full stack or raw API response.
 */

export type ErrorKind = 'usage_limit';

export interface NormalizedRunError {
  errorKind?: ErrorKind;
  displayError: string;
}

const USAGE_LIMIT_PATTERNS = [
  /usage\s*limit/i,
  /you'?ve\s+hit\s+your\s+usage\s+limit/i,
  /try\s+again\s+at\s+/i,
  /purchase\s+more\s+credits/i,
  /codex\/settings\/usage/i
];

/**
 * Extracts a short user-friendly message from usage-limit error text.
 * Handles JSON-wrapped messages (e.g. from API responses).
 */
function extractUsageLimitMessage(raw: string): string {
  let msg = raw;
  // Unwrap JSON: "ERROR: \"You've hit your usage limit...\", \"context\":{...}"
  const quoted = msg.match(/"([^"]*usage\s*limit[^"]*(?:try\s+again[^"]*)?)"/i);
  if (quoted?.[1]) {
    msg = quoted[1];
  }
  // Extract "try again at <date>" if present
  const tryAgain = msg.match(/try\s+again\s+at\s+(.+?)(?:\.|"|$)/si);
  const tryAgainPart = tryAgain?.[1] ? ` Try again after ${tryAgain[1].trim()}.` : '';
  // Build friendly message
  if (msg.toLowerCase().includes('usage limit')) {
    return `Usage limit reached. Visit https://chatgpt.com/codex/settings/usage to upgrade or add credits.${tryAgainPart}`;
  }
  return `Usage limit reached. Visit https://chatgpt.com/codex/settings/usage to upgrade or add credits.${tryAgainPart}`;
}

/**
 * Parses the "try again at <date>" from a usage-limit error and returns the Date, or null if not found/unparseable.
 * Handles formats like "Feb 27th, 2026 10:33 PM" from Codex API.
 */
export function parseUsageLimitRetryAt(error: string | undefined): Date | null {
  if (!error || typeof error !== 'string') return null;
  const match = error.match(/try\s+again\s+at\s+(.+?)(?:\.|"|$)/si);
  const dateStr = match?.[1]?.trim();
  if (!dateStr) return null;
  // Strip ordinals (27th -> 27) for better Date.parse compatibility
  const normalized = dateStr.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return d.getTime() > Date.now() ? d : null;
}

export function normalizeRunError(error: string | undefined): NormalizedRunError {
  if (error == null || typeof error !== 'string' || error.trim() === '') {
    return { displayError: 'Unknown error' };
  }
  const isUsageLimit = USAGE_LIMIT_PATTERNS.some((p) => p.test(error));
  if (isUsageLimit) {
    return {
      errorKind: 'usage_limit',
      displayError: extractUsageLimitMessage(error)
    };
  }
  return { displayError: error };
}
