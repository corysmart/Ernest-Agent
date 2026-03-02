/**
 * TPM-style attestation producer for ernest-mail agent routes.
 * Uses ECDSA P-256 (software key). Same wire format as hardware TPM.
 */

import { createSign, createPrivateKey, createPublicKey, createHash } from 'crypto';

function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k])
  );
  return '{' + pairs.join(',') + '}';
}

/** Compute SHA-256 body hash (hex). Matches ernest-mail computeBodyHash. */
export function computeBodyHash(body: unknown): string {
  if (body === undefined || body === null) return '';
  const str = canonicalJson(body);
  if (!str || str === '{}' || str === '[]') return '';
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

/** Canonical payload string for signing. Matches ernest-mail payloadToSignString. */
function payloadToSignString(payload: {
  timestamp: string;
  method: string;
  path: string;
  bodyHash: string;
  tenantId?: string;
}): string {
  const obj: Record<string, string> = {
    bodyHash: payload.bodyHash,
    method: payload.method,
    path: payload.path,
    timestamp: payload.timestamp
  };
  if (payload.tenantId) obj.tenantId = payload.tenantId;
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/** Derive base64url SPKI from PEM private key. */
export function getPublicKeyBase64Url(privateKeyPem: string): string {
  const priv = createPrivateKey(privateKeyPem);
  const pub = createPublicKey(priv);
  const der = pub.export({ type: 'spki', format: 'der' }) as Buffer;
  return der.toString('base64url');
}

/** Create self-registration attestation. Agent proves key possession to register without admin. */
export function createSelfRegisterAttestation(options: {
  agentId: string;
  privateKeyPem: string;
}): { agentId: string; format: 'tpm'; publicKey: string; signature: string; payload: { action: string; agentId: string; timestamp: string } } {
  const { agentId, privateKeyPem } = options;
  const payload = {
    action: 'register',
    agentId,
    timestamp: new Date().toISOString()
  };
  const payloadStr = JSON.stringify(payload, ['action', 'agentId', 'timestamp']);
  const sign = createSign('SHA256');
  sign.update(payloadStr, 'utf8');
  sign.end();
  const signature = sign.sign(privateKeyPem);
  return {
    agentId,
    format: 'tpm',
    publicKey: getPublicKeyBase64Url(privateKeyPem),
    signature: signature.toString('base64url'),
    payload
  };
}

/** Create TPM-style attestation for ernest-mail /emails/send. */
export function createTpmAttestation(options: {
  method: string;
  path: string;
  body: unknown;
  tenantId?: string;
  privateKeyPem: string;
}): string {
  const { method, path, body, tenantId, privateKeyPem } = options;
  const bodyHash = computeBodyHash(body);
  const payload = {
    timestamp: new Date().toISOString(),
    method,
    path,
    bodyHash,
    ...(tenantId && tenantId.trim() ? { tenantId: tenantId.trim() } : {})
  };
  const payloadStr = payloadToSignString(payload);
  const sign = createSign('SHA256');
  sign.update(payloadStr, 'utf8');
  sign.end();
  const signature = sign.sign(privateKeyPem);
  const attestation = {
    format: 'tpm',
    signature: signature.toString('base64url'),
    publicKey: getPublicKeyBase64Url(privateKeyPem),
    payload
  };
  return Buffer.from(JSON.stringify(attestation), 'utf8').toString('base64url');
}
