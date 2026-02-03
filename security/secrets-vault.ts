export interface SecretsVault {
  getSecret(key: string): string;
  setSecret(key: string, value: string): void;
}

export class InMemorySecretsVault implements SecretsVault {
  private readonly secrets = new Map<string, string>();

  getSecret(key: string): string {
    const value = this.secrets.get(key);
    if (!value) {
      throw new Error('Secret not found');
    }
    return value;
  }

  setSecret(key: string, value: string): void {
    if (!key) {
      throw new Error('Secret key required');
    }
    this.secrets.set(key, value);
  }
}

export class EnvSecretsVault implements SecretsVault {
  getSecret(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error('Secret not found');
    }
    return value;
  }

  setSecret(): void {
    throw new Error('EnvSecretsVault is read-only');
  }
}
