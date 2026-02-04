import { isSafeUrl, isSafeUrlBasic } from '../../security/ssrf-protection';

describe('SSRF protection', () => {
  it('rejects private IPs', () => {
    expect(isSafeUrlBasic('http://127.0.0.1')).toBe(false);
    expect(isSafeUrlBasic('http://10.0.0.1')).toBe(false);
    expect(isSafeUrlBasic('http://192.168.1.5')).toBe(false);
  });

  it('accepts allowlisted domains', () => {
    expect(isSafeUrlBasic('https://api.example.com', { allowlist: ['api.example.com'] })).toBe(true);
  });

  it('rejects non-allowlisted domains when allowlist provided', () => {
    expect(isSafeUrlBasic('https://evil.com', { allowlist: ['api.example.com'] })).toBe(false);
  });

  it('rejects hostnames resolving to private IPs', async () => {
    const result = await isSafeUrl('https://internal.example', {
      lookupFn: async () => [{ address: '10.0.0.5' }]
    });

    expect(result).toBe(false);
  });

  it('accepts hostnames resolving to public IPs', async () => {
    const result = await isSafeUrl('https://public.example', {
      lookupFn: async () => [{ address: '93.184.216.34' }]
    });

    expect(result).toBe(true);
  });
});
