import { randomUUID } from 'crypto';
import type { AgentRegistry } from './agent-registry';
import type { MessageBus } from './message-bus';
import type { AgentMessage, MessageType } from './message';
import { assertSafePayload } from '../env/validation';

interface SendOptions {
  from: string;
  to: string;
  type: MessageType;
  payload: Record<string, unknown>;
}

export class MultiAgentCoordinator {
  constructor(private readonly options: { registry: AgentRegistry; bus: MessageBus }) {}

  async send(options: SendOptions): Promise<void> {
    const sender = this.options.registry.get(options.from);
    const receiver = this.options.registry.get(options.to);
    if (!sender || !receiver) {
      throw new Error('Agent not registered');
    }

    assertSafePayload(options.payload);

    if (options.type === 'memory') {
      const scope = String(options.payload.memoryScope ?? '');
      if (!this.options.registry.canAccessMemory(options.to, scope)) {
        throw new Error('Memory scope not allowed');
      }
    }

    const message: AgentMessage = {
      id: randomUUID(),
      from: options.from,
      to: options.to,
      type: options.type,
      payload: options.payload,
      timestamp: Date.now()
    };

    await this.options.bus.publish(message);
  }
}
