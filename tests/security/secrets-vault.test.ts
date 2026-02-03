import { EnvSecretsVault, InMemorySecretsVault } from '../../security/secrets-vault';

describe('InMemorySecretsVault', () => {
  it('stores and retrieves secrets', () => {
    const vault = new InMemorySecretsVault();
    vault.setSecret('apiKey', 'secret');

    expect(vault.getSecret('apiKey')).toBe('secret');
  });

  it('throws on missing secrets', () => {
    const vault = new InMemorySecretsVault();
    expect(() => vault.getSecret('missing')).toThrow('Secret not found');
  });

  it('reads secrets from environment and is read-only', () => {
    process.env.TEST_SECRET = 'value';
    const vault = new EnvSecretsVault();

    expect(vault.getSecret('TEST_SECRET')).toBe('value');
    expect(() => vault.setSecret('TEST_SECRET', 'new')).toThrow('read-only');
  });
});
