import type { AgentProfile } from './types';

export class AgentRegistry {
  private readonly agents = new Map<string, AgentProfile>();

  register(profile: AgentProfile): void {
    validateProfile(profile);
    if (this.agents.has(profile.id)) {
      throw new Error('Agent already registered');
    }

    this.agents.set(profile.id, {
      ...profile,
      createdAt: profile.createdAt ?? Date.now()
    });
  }

  get(id: string): AgentProfile | undefined {
    return this.agents.get(id);
  }

  list(): AgentProfile[] {
    return [...this.agents.values()];
  }

  listByRole(role: string): AgentProfile[] {
    return [...this.agents.values()].filter((agent) => agent.role === role);
  }

  canAccessMemory(agentId: string, scope: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }
    return agent.allowedMemoryScopes.includes(scope);
  }
}

function validateProfile(profile: AgentProfile): void {
  if (!profile.id || !profile.role) {
    throw new Error('Invalid agent profile');
  }
}
