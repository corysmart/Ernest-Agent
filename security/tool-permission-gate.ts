import type { AgentAction } from '../env/types';

interface ToolPermissionOptions {
  allow?: string[];
  deny?: string[];
}

export class ToolPermissionGate {
  private readonly allow: Set<string> | null;
  private readonly deny: Set<string>;

  constructor(options: ToolPermissionOptions = {}) {
    this.allow = options.allow ? new Set(options.allow) : null;
    this.deny = new Set(options.deny ?? []);
  }

  isAllowed(action: AgentAction): { allowed: boolean; reason?: string } {
    if (!action.type) {
      return { allowed: false, reason: 'Action type required' };
    }

    if (this.deny.has(action.type)) {
      return { allowed: false, reason: 'Action denied' };
    }

    if (this.allow && !this.allow.has(action.type)) {
      return { allowed: false, reason: 'Action not in allowlist' };
    }

    return { allowed: true };
  }
}
