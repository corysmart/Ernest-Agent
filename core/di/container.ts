export type Token<T> = string | symbol;

type Factory<T> = (container: Container) => T;

interface Provider<T> {
  factory: Factory<T>;
  singleton: boolean;
}

export class Container {
  private readonly providers = new Map<Token<unknown>, Provider<unknown>>();
  private readonly singletons = new Map<Token<unknown>, unknown>();

  register<T>(token: Token<T>, factory: Factory<T>, options?: { singleton?: boolean }): void {
    if (typeof token !== 'string' && typeof token !== 'symbol') {
      throw new Error('Token must be a string or symbol');
    }

    this.providers.set(token, {
      factory,
      singleton: options?.singleton ?? false
    });
  }

  registerValue<T>(token: Token<T>, value: T): void {
    if (typeof token !== 'string' && typeof token !== 'symbol') {
      throw new Error('Token must be a string or symbol');
    }

    this.providers.set(token, {
      factory: () => value,
      singleton: true
    });
    this.singletons.set(token, value);
  }

  resolve<T>(token: Token<T>): T {
    const provider = this.providers.get(token);
    if (!provider) {
      throw new Error(`No provider registered for token: ${String(token)}`);
    }

    if (provider.singleton) {
      if (this.singletons.has(token)) {
        return this.singletons.get(token) as T;
      }

      const instance = provider.factory(this) as T;
      this.singletons.set(token, instance);
      return instance;
    }

    return provider.factory(this) as T;
  }
}
