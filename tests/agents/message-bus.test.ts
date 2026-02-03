import { InMemoryMessageBus } from '../../agents/in-memory-bus';

describe('InMemoryMessageBus', () => {
  it('delivers messages to subscribers', async () => {
    const bus = new InMemoryMessageBus();
    const received: string[] = [];

    bus.subscribe('agent-1', (message) => {
      received.push(message.type);
    });

    await bus.publish({
      id: 'm1',
      from: 'agent-2',
      to: 'agent-1',
      type: 'task',
      payload: { task: 'analyze' },
      timestamp: Date.now()
    });

    expect(received).toEqual(['task']);
  });

  it('supports unsubscribing', async () => {
    const bus = new InMemoryMessageBus();
    const received: string[] = [];

    const unsubscribe = bus.subscribe('agent-1', (message) => {
      received.push(message.type);
    });

    unsubscribe();

    await bus.publish({
      id: 'm2',
      from: 'agent-2',
      to: 'agent-1',
      type: 'task',
      payload: { task: 'ignore' },
      timestamp: Date.now()
    });

    expect(received).toEqual([]);
  });
});
