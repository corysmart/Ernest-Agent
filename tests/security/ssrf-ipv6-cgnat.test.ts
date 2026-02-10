import { isSafeUrlBasic, isSafeUrl } from '../../security/ssrf-protection';

describe('SSRF Protection - IPv4-mapped IPv6 and CGNAT', () => {
  it('P2: blocks IPv4-mapped IPv6 loopback addresses', () => {
    // ::ffff:127.0.0.1 is IPv4-mapped IPv6 for 127.0.0.1
    // Using localhost allows HTTP for testing private IP detection
    const isSafe = isSafeUrlBasic('http://[::ffff:127.0.0.1]:8080/api');
    expect(isSafe).toBe(false);
  });

  it('P2: blocks IPv4-mapped IPv6 private addresses', () => {
    // ::ffff:10.0.0.1 is IPv4-mapped IPv6 for 10.0.0.1 (private)
    // Using localhost allows HTTP for testing private IP detection
    const isSafe = isSafeUrlBasic('http://[::ffff:10.0.0.1]:8080/api');
    expect(isSafe).toBe(false);
  });

  it('P2: blocks IPv4-mapped IPv6 192.168 addresses', () => {
    // ::ffff:192.168.1.1 is IPv4-mapped IPv6 for 192.168.1.1 (private)
    // Using localhost allows HTTP for testing private IP detection
    const isSafe = isSafeUrlBasic('http://[::ffff:192.168.1.1]:8080/api');
    expect(isSafe).toBe(false);
  });

  it('P2: blocks CGNAT range (100.64.0.0/10)', () => {
    // CGNAT range: 100.64.0.0 to 100.127.255.255
    const isSafe1 = isSafeUrlBasic('http://100.64.0.1:8080/api');
    expect(isSafe1).toBe(false);

    const isSafe2 = isSafeUrlBasic('http://100.100.100.100:8080/api');
    expect(isSafe2).toBe(false);

    const isSafe3 = isSafeUrlBasic('http://100.127.255.255:8080/api');
    expect(isSafe3).toBe(false);
  });

  it('allows public IPs outside CGNAT range', () => {
    // 100.63.255.255 is just before CGNAT range
    // Use HTTPS since HTTP is now restricted for non-localhost
    const isSafe1 = isSafeUrlBasic('https://100.63.255.255:8080/api');
    expect(isSafe1).toBe(true);

    // 100.128.0.0 is just after CGNAT range
    const isSafe2 = isSafeUrlBasic('https://100.128.0.0:8080/api');
    expect(isSafe2).toBe(true);
  });

  it('P2: blocks IPv4-mapped IPv6 CGNAT addresses', () => {
    // ::ffff:100.64.0.1 is IPv4-mapped IPv6 for CGNAT address
    const isSafe = isSafeUrlBasic('http://[::ffff:100.64.0.1]:8080/api');
    expect(isSafe).toBe(false);
  });

  it('allows regular IPv6 public addresses', () => {
    // Regular IPv6 public address (not mapped)
    // Use HTTPS since HTTP is now restricted for non-localhost
    const isSafe = isSafeUrlBasic('https://[2001:db8::1]:8080/api');
    expect(isSafe).toBe(true);
  });

  it('P2: blocks IPv4-mapped IPv6 addresses via DNS resolution', async () => {
    // Mock DNS lookup to return IPv4-mapped IPv6 address
    const mockLookup = async () => [{ address: '::ffff:127.0.0.1' }];
    
    const isSafe = await isSafeUrl('http://example.com/api', { lookupFn: mockLookup });
    expect(isSafe).toBe(false);
  });

  it('P2: blocks CGNAT addresses via DNS resolution', async () => {
    // Mock DNS lookup to return CGNAT address
    const mockLookup = async () => [{ address: '100.64.0.1' }];
    
    const isSafe = await isSafeUrl('http://example.com/api', { lookupFn: mockLookup });
    expect(isSafe).toBe(false);
  });
});

