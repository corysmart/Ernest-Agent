import type { AgentAction } from '../env/types';

interface ToolPermissionOptions {
  allow?: string[];
  deny?: string[];
  /**
   * P2: Per-tool payload restrictions
   * Maps tool type to allowed payload keys or validation function
   */
  payloadRestrictions?: Record<string, {
    allowedKeys?: string[];
    deniedKeys?: string[];
    validate?: (payload: Record<string, unknown>) => { allowed: boolean; reason?: string };
  }>;
}

export class ToolPermissionGate {
  private readonly allow: Set<string> | null;
  private readonly deny: Set<string>;
  private readonly payloadRestrictions: ToolPermissionOptions['payloadRestrictions'];

  constructor(options: ToolPermissionOptions = {}) {
    this.allow = options.allow ? new Set(options.allow) : null;
    this.deny = new Set(options.deny ?? []);
    this.payloadRestrictions = options.payloadRestrictions;
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

    // P2: Validate payload-level restrictions for the tool
    // Once a tool is allowed, we still need to validate its payload to prevent dangerous parameters
    if (this.payloadRestrictions && action.payload) {
      const restrictions = this.payloadRestrictions[action.type];
      if (restrictions) {
        // Check allowed keys (if specified, only these keys are permitted)
        if (restrictions.allowedKeys) {
          const payloadKeys = Object.keys(action.payload);
          const disallowedKeys = payloadKeys.filter((key) => !restrictions.allowedKeys!.includes(key));
          if (disallowedKeys.length > 0) {
            return { allowed: false, reason: `Payload contains disallowed keys: ${disallowedKeys.join(', ')}` };
          }
        }

        // Check denied keys
        if (restrictions.deniedKeys) {
          const payloadKeys = Object.keys(action.payload);
          const deniedKeys = payloadKeys.filter((key) => restrictions.deniedKeys!.includes(key));
          if (deniedKeys.length > 0) {
            return { allowed: false, reason: `Payload contains denied keys: ${deniedKeys.join(', ')}` };
          }
        }

        // Custom validation function
        if (restrictions.validate) {
          const validation = restrictions.validate(action.payload);
          if (!validation.allowed) {
            return validation;
          }
        }
      }
    }

    return { allowed: true };
  }
}
