export interface SelfModelSnapshot {
  capabilities: string[];
  tools: string[];
  reliability: number;
  confidence: number;
  failures: number;
  successes: number;
}
