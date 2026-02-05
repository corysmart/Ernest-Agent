import { isIP } from 'net';
import { lookup } from 'dns/promises';

interface SSRFOptions {
  allowlist?: string[];
  resolveDns?: boolean;
  lookupFn?: (hostname: string) => Promise<Array<{ address: string }>>;
}

export function isSafeUrlBasic(url: string, options: SSRFOptions = {}): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return false;
  }

  if (options.allowlist && options.allowlist.length > 0) {
    return options.allowlist.includes(parsed.hostname);
  }

  if (parsed.hostname === 'localhost') {
    return false;
  }

  // P2: Handle IPv6 addresses - Node.js URL parser may expand IPv4-mapped IPv6
  // For example: [::ffff:127.0.0.1] becomes [::ffff:7f00:1] (expanded format)
  let hostnameToCheck = parsed.hostname;
  
  // Remove brackets if present (Node.js URL parser may keep them for some formats)
  if (hostnameToCheck.startsWith('[') && hostnameToCheck.endsWith(']')) {
    hostnameToCheck = hostnameToCheck.slice(1, -1);
  }
  
  const ipType = isIP(hostnameToCheck);
  if (ipType === 6) {
    // IPv6 address - check if it's IPv4-mapped (::ffff:x.x.x.x or expanded format)
    // Expanded format: ::ffff:7f00:1 = ::ffff:127.0.0.1
    // Try to extract IPv4 from IPv4-mapped IPv6
    const ipv4MappedMatch = hostnameToCheck.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (ipv4MappedMatch) {
      // Convert expanded hex format back to IPv4
      const octet1 = parseInt(ipv4MappedMatch[1]!, 16);
      const octet2 = parseInt(ipv4MappedMatch[2]!, 16);
      const ipv4 = `${Math.floor(octet1 / 256)}.${octet1 % 256}.${Math.floor(octet2 / 256)}.${octet2 % 256}`;
      return !isPrivateIp(ipv4);
    }
    // Also check standard IPv4-mapped format (::ffff:x.x.x.x)
    const standardMatch = hostnameToCheck.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (standardMatch) {
      return !isPrivateIp(standardMatch[1]!);
    }
    // Check if it's a private IPv6 address
    return !isPrivateIp(hostnameToCheck);
  }
  
  if (ipType === 4) {
    // IPv4 address
    return !isPrivateIp(hostnameToCheck);
  }

  return true;
}

export async function isSafeUrl(url: string, options: SSRFOptions = {}): Promise<boolean> {
  if (!isSafeUrlBasic(url, options)) {
    return false;
  }

  const parsed = new URL(url);
  if (options.allowlist && options.allowlist.length > 0) {
    return true;
  }

  if (isIP(parsed.hostname)) {
    return true;
  }

  if (options.resolveDns === false) {
    return true;
  }

  const lookupFn = options.lookupFn ?? defaultLookup;
  const addresses = await lookupFn(parsed.hostname);
  if (!addresses.length) {
    return false;
  }

  return addresses.every((entry) => !isPrivateIp(entry.address));
}

function isPrivateIp(ip: string): boolean {
  // IPv6 loopback
  if (ip === '::1') {
    return true;
  }

  // IPv6 unique local addresses (fc00::/7)
  if (ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }

  // IPv6 link-local addresses (fe80::/10)
  if (ip.startsWith('fe80:')) {
    return true;
  }

  // P2: Handle IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  // Extract IPv4 from IPv4-mapped IPv6 format
  const ipv4MappedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4MappedMatch) {
    return isPrivateIp(ipv4MappedMatch[1]!); // Recursively check the IPv4 address
  }

  // IPv4 loopback and unspecified
  if (ip.startsWith('127.') || ip === '0.0.0.0') {
    return true;
  }

  // IPv4 private ranges
  if (ip.startsWith('10.')) {
    return true;
  }

  if (ip.startsWith('192.168.')) {
    return true;
  }

  const match = ip.match(/^172\.(\d+)\./);
  if (match) {
    const octet = Number(match[1]);
    if (octet >= 16 && octet <= 31) {
      return true;
    }
  }

  // IPv4 link-local (169.254.0.0/16)
  if (ip.startsWith('169.254.')) {
    return true;
  }

  // P2: CGNAT range (100.64.0.0/10) - Carrier-Grade NAT
  // This range is used by ISPs and should be treated as private
  const cgnatMatch = ip.match(/^100\.(\d+)\./);
  if (cgnatMatch) {
    const octet = Number(cgnatMatch[1]);
    if (octet >= 64 && octet <= 127) {
      return true;
    }
  }

  return false;
}

async function defaultLookup(hostname: string): Promise<Array<{ address: string }>> {
  const results = await lookup(hostname, { all: true });
  return results.map((entry) => ({ address: entry.address }));
}
