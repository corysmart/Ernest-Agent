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
    // P3: Return defensive copy to prevent external mutation of registry state
    const agent = this.agents.get(id);
    if (!agent) {
      return undefined;
    }
    
    return {
      id: agent.id,
      role: agent.role,
      capabilities: agent.capabilities ? [...agent.capabilities] : [],
      allowedMemoryScopes: [...agent.allowedMemoryScopes]
    };
  }

  list(): AgentProfile[] {
    // P3: Return defensive copies to prevent external mutation of registry state
    return [...this.agents.values()].map((agent) => ({
      ...agent,
      // Deep copy arrays to prevent mutation
      allowedMemoryScopes: [...agent.allowedMemoryScopes],
      capabilities: [...agent.capabilities]
    }));
  }

  listByRole(role: string): AgentProfile[] {
    // P3: Return defensive copies to prevent external mutation
    return [...this.agents.values()]
      .filter((agent) => agent.role === role)
      .map((agent) => ({
        ...agent,
        allowedMemoryScopes: [...agent.allowedMemoryScopes],
        capabilities: [...agent.capabilities]
      }));
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
