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

  const ipType = isIP(parsed.hostname);
  if (ipType) {
    return !isPrivateIp(parsed.hostname);
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
  if (ip === '::1') {
    return true;
  }

  if (ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }

  if (ip.startsWith('fe80:')) {
    return true;
  }

  if (ip.startsWith('127.') || ip === '0.0.0.0') {
    return true;
  }

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

  if (ip.startsWith('169.254.')) {
    return true;
  }

  return false;
}

async function defaultLookup(hostname: string): Promise<Array<{ address: string }>> {
  const results = await lookup(hostname, { all: true });
  return results.map((entry) => ({ address: entry.address }));
}
