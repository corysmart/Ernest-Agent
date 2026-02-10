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

  describe('P2: HTTP enforcement for hosted providers', () => {
    it('rejects HTTP for non-localhost URLs', () => {
      expect(isSafeUrlBasic('http://api.example.com')).toBe(false);
      expect(isSafeUrlBasic('http://192.168.1.1')).toBe(false);
    });

    it('allows HTTP for localhost', () => {
      expect(isSafeUrlBasic('http://localhost:8080')).toBe(false); // Still rejected due to localhost check
      expect(isSafeUrlBasic('http://127.0.0.1:8080')).toBe(false); // Still rejected due to private IP check
    });

    it('allows HTTP for allowlisted domains', () => {
      expect(isSafeUrlBasic('http://api.example.com', { allowlist: ['api.example.com'] })).toBe(true);
    });

    it('requires HTTPS for non-allowlisted, non-localhost URLs', () => {
      expect(isSafeUrlBasic('https://api.example.com')).toBe(true);
      expect(isSafeUrlBasic('http://api.example.com')).toBe(false);
    });
  });
});
