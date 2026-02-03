import { AgentRegistry } from '../../agents/agent-registry';
import { InMemoryMessageBus } from '../../agents/in-memory-bus';
import { MultiAgentCoordinator } from '../../agents/multi-agent-coordinator';

describe('MultiAgentCoordinator', () => {
  it('sends messages between registered agents', async () => {
    const registry = new AgentRegistry();
    registry.register({ id: 'a1', role: 'planner', capabilities: [], allowedMemoryScopes: [] });
    registry.register({ id: 'a2', role: 'worker', capabilities: [], allowedMemoryScopes: [] });

    const bus = new InMemoryMessageBus();
    const coordinator = new MultiAgentCoordinator({ registry, bus });
    const received: string[] = [];

    bus.subscribe('a2', (message) => received.push(message.type));

    await coordinator.send({
      from: 'a1',
      to: 'a2',
      type: 'task',
      payload: { task: 'check' }
    });

    expect(received).toEqual(['task']);
  });

  it('blocks messages that violate memory boundaries', async () => {
    const registry = new AgentRegistry();
    registry.register({ id: 'a1', role: 'planner', capabilities: [], allowedMemoryScopes: ['local'] });
    registry.register({ id: 'a2', role: 'worker', capabilities: [], allowedMemoryScopes: [] });

    const bus = new InMemoryMessageBus();
    const coordinator = new MultiAgentCoordinator({ registry, bus });

    await expect(coordinator.send({
      from: 'a1',
      to: 'a2',
      type: 'memory',
      payload: { memoryScope: 'local', content: 'secret' }
    })).rejects.toThrow('Memory scope not allowed');
  });

  it('rejects unsafe payloads', async () => {
    const registry = new AgentRegistry();
    registry.register({ id: 'a1', role: 'planner', capabilities: [], allowedMemoryScopes: [] });
    registry.register({ id: 'a2', role: 'worker', capabilities: [], allowedMemoryScopes: [] });

    const bus = new InMemoryMessageBus();
    const coordinator = new MultiAgentCoordinator({ registry, bus });

    await expect(coordinator.send({
      from: 'a1',
      to: 'a2',
      type: 'task',
      payload: { __proto__: { hacked: true } }
    } as any)).rejects.toThrow('Unsafe payload');
  });
});
