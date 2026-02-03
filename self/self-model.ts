import type { SelfModelSnapshot } from './types';

export class SelfModel {
  private capabilities = new Set<string>();
  private tools = new Set<string>();
  private reliability = 0.7;
  private confidence = 0.7;
  private failures = 0;
  private successes = 0;

  updateCapabilities(capabilities: string[]): void {
    for (const capability of capabilities) {
      if (!capability || capability.trim().length === 0) {
        throw new Error('Invalid capability');
      }
      this.capabilities.add(capability);
    }
  }

  updateTools(tools: string[]): void {
    for (const tool of tools) {
      if (!tool || tool.trim().length === 0) {
        throw new Error('Invalid tool');
      }
      this.tools.add(tool);
    }
  }

  recordOutcome(success: boolean): void {
    if (success) {
      this.successes += 1;
      this.reliability = clamp(this.reliability + 0.03);
      this.confidence = clamp(this.confidence + 0.02);
      return;
    }

    this.failures += 1;
    this.reliability = clamp(this.reliability - 0.08);
    this.confidence = clamp(this.confidence - 0.1);
  }

  snapshot(): SelfModelSnapshot {
    return {
      capabilities: [...this.capabilities],
      tools: [...this.tools],
      reliability: this.reliability,
      confidence: this.confidence,
      failures: this.failures,
      successes: this.successes
    };
  }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
