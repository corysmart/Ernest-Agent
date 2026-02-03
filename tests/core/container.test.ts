import { Container } from '../../core/di/container';

describe('Container', () => {
  it('returns singleton instances when configured', () => {
    const container = new Container();
    const token = 'service';
    let calls = 0;

    container.register(token, () => {
      calls += 1;
      return { value: 'ok' };
    }, { singleton: true });

    const first = container.resolve<{ value: string }>(token);
    const second = container.resolve<{ value: string }>(token);

    expect(first).toBe(second);
    expect(calls).toBe(1);
  });

  it('returns new instances for transient registrations', () => {
    const container = new Container();
    const token = 'transient';

    container.register(token, () => ({ id: Math.random() }));

    const first = container.resolve<{ id: number }>(token);
    const second = container.resolve<{ id: number }>(token);

    expect(first).not.toBe(second);
  });

  it('throws on unknown tokens', () => {
    const container = new Container();

    expect(() => container.resolve('missing')).toThrow('No provider registered');
  });

  it('rejects invalid tokens to prevent prototype pollution', () => {
    const container = new Container();

    expect(() => container.register({} as any, () => ({}))).toThrow('Token must be a string or symbol');
  });
});
