import type { AgentProfile } from './types';

export class AgentRegistry {
  private readonly agents = new Map<string, AgentProfile>();

  register(profile: AgentProfile): void {
    validateProfile(profile);
    if (this.agents.has(profile.id)) {
      throw new Error('Agent already registered');
    }

    // P3: Deep copy arrays to prevent external mutation of internal state
    // If caller mutates allowedMemoryScopes or capabilities after registration,
    // it would mutate internal state and potentially bypass expected invariants
    // This matches the defensive copying behavior in get(), list(), and listByRole()
    this.agents.set(profile.id, {
      ...profile,
      capabilities: profile.capabilities ? [...profile.capabilities] : [],
      allowedMemoryScopes: [...profile.allowedMemoryScopes],
      createdAt: profile.createdAt ?? Date.now()
    });
  }

  get(id: string): AgentProfile | undefined {
    // P3: Return defensive copy to prevent external mutation of registry state
    const agent = this.agents.get(id);
    if (!agent) {
      return undefined;
    }
    
    // P3: Include createdAt to match behavior of list() / listByRole() and prevent behavioral regression
    return {
      id: agent.id,
      role: agent.role,
      capabilities: agent.capabilities ? [...agent.capabilities] : [],
      allowedMemoryScopes: [...agent.allowedMemoryScopes],
      createdAt: agent.createdAt
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
