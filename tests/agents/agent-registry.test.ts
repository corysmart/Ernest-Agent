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
});
