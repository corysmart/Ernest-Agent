/**
 * Unit tests for TPM attestation client.
 */

import { generateKeyPairSync } from 'crypto';
import {
  computeBodyHash,
  getPublicKeyBase64Url,
  createTpmAttestation,
  createSelfRegisterAttestation
} from '../../tools/attestation-client';

describe('attestation-client', () => {
  let privateKeyPem: string;

  beforeAll(() => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  });

  describe('computeBodyHash', () => {
    it('returns empty for null', () => {
      expect(computeBodyHash(null)).toBe('');
    });
    it('returns deterministic hash for same object', () => {
      const obj = { a: 1, b: 2 };
      expect(computeBodyHash(obj)).toBe(computeBodyHash(obj));
    });
    it('returns same hash regardless of key order', () => {
      expect(computeBodyHash({ b: 2, a: 1 })).toBe(computeBodyHash({ a: 1, b: 2 }));
    });
  });

  describe('getPublicKeyBase64Url', () => {
    it('returns base64url string', () => {
      const result = getPublicKeyBase64Url(privateKeyPem);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('createTpmAttestation', () => {
    it('returns base64url-encoded attestation', () => {
      const body = { accountId: 'a1', to: 'u@example.com', subject: 'Hi', text: 'Body' };
      const raw = createTpmAttestation({
        method: 'POST',
        path: '/emails/send',
        body,
        privateKeyPem
      });
      expect(typeof raw).toBe('string');
      expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
      const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      expect(decoded.format).toBe('tpm');
      expect(decoded.signature).toBeDefined();
      expect(decoded.publicKey).toBeDefined();
      expect(decoded.payload).toMatchObject({
        method: 'POST',
        path: '/emails/send',
        bodyHash: expect.any(String)
      });
    });
    it('createSelfRegisterAttestation produces valid payload', () => {
      const att = createSelfRegisterAttestation({
        agentId: 'test-agent',
        privateKeyPem
      });
      expect(att.agentId).toBe('test-agent');
      expect(att.format).toBe('tpm');
      expect(att.publicKey).toBeDefined();
      expect(att.signature).toBeDefined();
      expect(att.payload).toMatchObject({
        action: 'register',
        agentId: 'test-agent',
        timestamp: expect.any(String)
      });
    });

    it('includes tenantId when provided', () => {
      const body = { accountId: 'a1', to: 'u@example.com', subject: 'Hi', text: 'Body' };
      const raw = createTpmAttestation({
        method: 'POST',
        path: '/emails/send',
        body,
        tenantId: 'tenant-x',
        privateKeyPem
      });
      const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      expect(decoded.payload.tenantId).toBe('tenant-x');
    });
  });
});
