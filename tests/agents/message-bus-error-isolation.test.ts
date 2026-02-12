import { InMemoryMessageBus } from '../../agents/in-memory-bus';
import type { AgentMessage } from '../../agents/message';

describe('Message Bus Error Isolation', () => {
  it('P2: isolates handler failures to prevent blocking other subscribers', async () => {
    const bus = new InMemoryMessageBus();
    const receivedMessages: AgentMessage[] = [];

    // First handler that throws
    bus.subscribe('agent-1', () => {
      throw new Error('Handler 1 failed');
    });

    // Second handler that succeeds
    bus.subscribe('agent-1', (msg) => {
      receivedMessages.push(msg);
    });

    // Third handler that throws
    bus.subscribe('agent-1', () => {
      throw new Error('Handler 3 failed');
    });

    const message: AgentMessage = {
      id: 'msg-1',
      from: 'agent-0',
      to: 'agent-1',
      type: 'task',
      payload: { data: 'test' },
      timestamp: Date.now()
    };

    // Should not throw even though some handlers fail
    await expect(bus.publish(message)).resolves.not.toThrow();

    // Verify the successful handler received the message
    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]).toEqual(message);
  });

  it('P2: throws if all handlers fail', async () => {
    const bus = new InMemoryMessageBus();

    // All handlers throw
    bus.subscribe('agent-1', () => {
      throw new Error('Handler 1 failed');
    });

    bus.subscribe('agent-1', () => {
      throw new Error('Handler 2 failed');
    });

    const message: AgentMessage = {
      id: 'msg-1',
      from: 'agent-0',
      to: 'agent-1',
      type: 'task',
      payload: {},
      timestamp: Date.now()
    };

    // Should throw when all handlers fail
    await expect(bus.publish(message)).rejects.toThrow();
  });

  it('allows successful handlers to process message even when others fail', async () => {
    const bus = new InMemoryMessageBus();
    const handler1Calls: AgentMessage[] = [];
    const handler2Calls: AgentMessage[] = [];

    bus.subscribe('agent-1', (message) => {
      handler1Calls.push(message);
      throw new Error('Handler 1 failed');
    });

    bus.subscribe('agent-1', (message) => {
      handler2Calls.push(message);
    });

    const message: AgentMessage = {
      id: 'msg-1',
      from: 'agent-0',
      to: 'agent-1',
      type: 'task',
      payload: { data: 'test' },
      timestamp: Date.now()
    };

    await bus.publish(message);

    // Both handlers should have been called
    expect(handler1Calls).toHaveLength(1);
    expect(handler2Calls).toHaveLength(1);
    expect(handler2Calls[0]).toEqual(message);
  });
});

