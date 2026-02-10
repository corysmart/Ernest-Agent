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

  it('P3: clones messages to prevent mutation by handlers', async () => {
    const bus = new InMemoryMessageBus();
    const originalPayload: Record<string, unknown> = { value: 'original' };
    const receivedPayloads: Record<string, unknown>[] = [];

    // First handler mutates the payload
    bus.subscribe('agent-1', (message) => {
      if (message.payload) {
        (message.payload as Record<string, unknown>).value = 'mutated-by-handler-1';
        (message.payload as Record<string, unknown>).added = 'by-handler-1';
      }
      receivedPayloads.push(message.payload ? { ...message.payload } : {});
    });

    // Second handler should see original payload, not mutated one
    bus.subscribe('agent-1', (message) => {
      receivedPayloads.push(message.payload ? { ...message.payload } : {});
    });

    await bus.publish({
      id: 'm3',
      from: 'agent-2',
      to: 'agent-1',
      type: 'task',
      payload: originalPayload,
      timestamp: Date.now()
    });

    // Both handlers should receive cloned payloads
    // First handler's mutation should not affect second handler
    expect(receivedPayloads).toHaveLength(2);
    expect(receivedPayloads[0]!.value).toBe('mutated-by-handler-1');
    expect(receivedPayloads[0]!.added).toBe('by-handler-1');
    // Second handler should see original payload (cloned, so mutations don't affect it)
    expect(receivedPayloads[1]!.value).toBe('original');
    expect(receivedPayloads[1]!.added).toBeUndefined();
    // Original payload should be unchanged
    expect(originalPayload.value).toBe('original');
    expect(originalPayload.added).toBeUndefined();
  });
});
