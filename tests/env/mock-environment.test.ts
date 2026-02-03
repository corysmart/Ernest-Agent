import { MockEnvironment } from '../../env/mock-environment';
import type { AgentAction, StateObservation } from '../../env/types';

describe('MockEnvironment', () => {
  it('returns queued observations in order', async () => {
    const observations: StateObservation[] = [
      { timestamp: 1, state: { status: 'init' } },
      { timestamp: 2, state: { status: 'next' } }
    ];
    const env = new MockEnvironment({ observations });

    const first = await env.observe();
    const second = await env.observe();

    expect(first.state.status).toBe('init');
    expect(second.state.status).toBe('next');
  });

  it('throws when no observations are available', async () => {
    const env = new MockEnvironment({ observations: [] });
    await expect(env.observe()).rejects.toThrow('No observations available');
  });

  it('returns action results from handler', async () => {
    const env = new MockEnvironment({
      observations: [{ timestamp: 1, state: { status: 'ok' } }],
      onAct: async (action: AgentAction) => ({ success: true, outputs: { echo: action.type } })
    });

    const result = await env.act({ type: 'ping' });
    expect(result.success).toBe(true);
    expect(result.outputs?.echo).toBe('ping');
  });

  it('rejects unsafe action payloads', async () => {
    const env = new MockEnvironment({ observations: [] });

    await expect(env.act({ type: 'unsafe', payload: { __proto__: { polluted: true } } as any })).rejects.toThrow('Unsafe payload');
  });
});
