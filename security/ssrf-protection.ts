import { isIP } from 'net';

interface SSRFOptions {
  allowlist?: string[];
}

export function isSafeUrl(url: string, options: SSRFOptions = {}): boolean {
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

function isPrivateIp(ip: string): boolean {
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
