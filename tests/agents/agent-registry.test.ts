import { AgentRegistry } from '../../agents/agent-registry';

describe('AgentRegistry', () => {
  it('registers and retrieves agents', () => {
    const registry = new AgentRegistry();
    registry.register({
      id: 'agent-1',
      role: 'planner',
      capabilities: ['plan'],
      allowedMemoryScopes: []
    });

    const agent = registry.get('agent-1');
    expect(agent?.role).toBe('planner');
  });

  it('rejects duplicate agent ids', () => {
    const registry = new AgentRegistry();
    registry.register({
      id: 'dup',
      role: 'worker',
      capabilities: [],
      allowedMemoryScopes: []
    });

    expect(() => registry.register({
      id: 'dup',
      role: 'worker',
      capabilities: [],
      allowedMemoryScopes: []
    })).toThrow('Agent already registered');
  });

  it('rejects invalid agent payload', () => {
    const registry = new AgentRegistry();
    expect(() => registry.register({
      id: '',
      role: '',
      capabilities: [],
      allowedMemoryScopes: []
    })).toThrow('Invalid agent profile');
  });

  it('lists all agents', () => {
    const registry = new AgentRegistry();
    registry.register({ id: 'a1', role: 'planner', capabilities: [], allowedMemoryScopes: [] });
    registry.register({ id: 'a2', role: 'worker', capabilities: [], allowedMemoryScopes: [] });
    const list = registry.list();
    expect(list).toHaveLength(2);
  });

  it('listByRole filters by role', () => {
    const registry = new AgentRegistry();
    registry.register({ id: 'p1', role: 'planner', capabilities: [], allowedMemoryScopes: [] });
    registry.register({ id: 'w1', role: 'worker', capabilities: [], allowedMemoryScopes: [] });
    const planners = registry.listByRole('planner');
    expect(planners).toHaveLength(1);
    expect(planners[0]!.id).toBe('p1');
  });

  it('canAccessMemory returns true when scope is in allowedMemoryScopes', () => {
    const registry = new AgentRegistry();
    registry.register({
      id: 'a1',
      role: 'worker',
      capabilities: [],
      allowedMemoryScopes: ['scope1']
    });
    expect(registry.canAccessMemory('a1', 'scope1')).toBe(true);
  });

  it('canAccessMemory returns false for unknown agent or scope', () => {
    const registry = new AgentRegistry();
    registry.register({
      id: 'a1',
      role: 'worker',
      capabilities: [],
      allowedMemoryScopes: ['scope1']
    });
    expect(registry.canAccessMemory('a1', 'scope2')).toBe(false);
    expect(registry.canAccessMemory('unknown', 'scope1')).toBe(false);
  });

  it('get returns undefined for unknown id', () => {
    const registry = new AgentRegistry();
    expect(registry.get('missing')).toBeUndefined();
  });
});
