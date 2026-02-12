/**
 * Tests for ernest-agent TUI helpers (extractAssistantContent, formatResult).
 */

import { extractAssistantContent, formatDurationMs, formatResult, type RunOnceResponse } from '../../cli/agent-tui-helpers';

describe('agent-tui-helpers', () => {
  describe('extractAssistantContent', () => {
    it('extracts response from actionPayload.response', () => {
      const result: RunOnceResponse = {
        status: 'dry_run',
        decision: {
          actionType: 'pursue_goal',
          actionPayload: { response: 'I can fix it, but I need details first.' },
          confidence: 0.78
        }
      };
      expect(extractAssistantContent(result)).toBe('I can fix it, but I need details first.');
    });

    it('extracts from actionPayload.message when response absent', () => {
      const result: RunOnceResponse = {
        status: 'completed',
        decision: {
          actionType: 'pursue_goal',
          actionPayload: { message: 'Which file would you like to refactor?' },
          confidence: 0.9
        }
      };
      expect(extractAssistantContent(result)).toBe('Which file would you like to refactor?');
    });

    it('falls back to reasoning when no response keys', () => {
      const result: RunOnceResponse = {
        status: 'dry_run',
        decision: {
          actionType: 'pursue_goal',
          actionPayload: {},
          reasoning: 'The request is underspecified.',
          confidence: 0.78
        }
      };
      expect(extractAssistantContent(result)).toBe('The request is underspecified.');
    });

    it('includes actionResult.error when no other content', () => {
      const result: RunOnceResponse = {
        status: 'error',
        actionResult: { success: false, error: 'Unsafe object' }
      };
      expect(extractAssistantContent(result)).toBe('Error: Unsafe object');
    });

    it('returns fallback when nothing to extract', () => {
      const result: RunOnceResponse = {
        status: 'idle'
      };
      expect(extractAssistantContent(result)).toBe('(No response text)');
    });
  });

  describe('formatResult', () => {
    it('formats dry_run with response', () => {
      const result: RunOnceResponse = {
        status: 'dry_run',
        decision: {
          actionType: 'pursue_goal',
          actionPayload: { response: 'I need more details.' },
          confidence: 0.78,
          reasoning: 'Underspecified request'
        },
        actionResult: { success: true, skipped: true },
        stateTrace: ['observe', 'query_llm', 'complete'],
        dryRunMode: 'with-llm'
      };
      const out = formatResult(result);
      expect(out).toContain('Status: dry_run');
      expect(out).toContain('Decision: pursue_goal');
      expect(out).toContain('Reasoning: Underspecified request');
      expect(out).toContain('Confidence: 0.78');
      expect(out).toContain('Response: I need more details.');
      expect(out).toContain('Tool success: true');
      expect(out).toContain('(Skipped - dry run)');
      expect(out).toContain('observe → query_llm → complete');
    });

    it('formats error result', () => {
      const result: RunOnceResponse = {
        status: 'error',
        error: 'Prompt injection detected'
      };
      const out = formatResult(result);
      expect(out).toContain('Status: error');
      expect(out).toContain('Error: Prompt injection detected');
    });

    it('formats duration as human-readable', () => {
      const result: RunOnceResponse = {
        status: 'completed',
        durationMs: 134000
      };
      const out = formatResult(result);
      expect(out).toContain('Duration: 2m 14s');
    });
  });

  describe('formatDurationMs', () => {
    it('formats seconds only when under 60s', () => {
      expect(formatDurationMs(45000)).toBe('45s');
    });
    it('formats minutes and seconds when 60s or more', () => {
      expect(formatDurationMs(134000)).toBe('2m 14s');
    });
  });
});
