import { isSafeUrl } from '../../security/ssrf-protection';

describe('SSRF protection', () => {
  it('rejects private IPs', () => {
    expect(isSafeUrl('http://127.0.0.1')).toBe(false);
    expect(isSafeUrl('http://10.0.0.1')).toBe(false);
    expect(isSafeUrl('http://192.168.1.5')).toBe(false);
  });

  it('accepts allowlisted domains', () => {
    expect(isSafeUrl('https://api.example.com', { allowlist: ['api.example.com'] })).toBe(true);
  });

  it('rejects non-allowlisted domains when allowlist provided', () => {
    expect(isSafeUrl('https://evil.com', { allowlist: ['api.example.com'] })).toBe(false);
  });
});
