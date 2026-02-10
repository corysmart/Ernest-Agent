import { ToolPermissionGate } from '../../security/tool-permission-gate';

describe('ToolPermissionGate', () => {
  it('allows actions in allowlist', () => {
    const gate = new ToolPermissionGate({ allow: ['read'] });
    const result = gate.isAllowed({ type: 'read' });
    expect(result.allowed).toBe(true);
  });

  it('denies actions not in allowlist', () => {
    const gate = new ToolPermissionGate({ allow: ['read'] });
    const result = gate.isAllowed({ type: 'write' });
    expect(result.allowed).toBe(false);
  });

  describe('P2: Payload-level restrictions', () => {
    it('allows payload with only allowed keys', () => {
      const gate = new ToolPermissionGate({
        allow: ['deploy'],
        payloadRestrictions: {
          deploy: {
            allowedKeys: ['environment', 'version']
          }
        }
      });

      const result = gate.isAllowed({
        type: 'deploy',
        payload: { environment: 'prod', version: '1.0.0' }
      });

      expect(result.allowed).toBe(true);
    });

    it('denies payload with disallowed keys', () => {
      const gate = new ToolPermissionGate({
        allow: ['deploy'],
        payloadRestrictions: {
          deploy: {
            allowedKeys: ['environment', 'version']
          }
        }
      });

      const result = gate.isAllowed({
        type: 'deploy',
        payload: { environment: 'prod', version: '1.0.0', dangerous: 'param' }
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('disallowed keys');
    });

    it('denies payload with denied keys', () => {
      const gate = new ToolPermissionGate({
        allow: ['execute'],
        payloadRestrictions: {
          execute: {
            deniedKeys: ['rm', 'delete', 'drop']
          }
        }
      });

      const result = gate.isAllowed({
        type: 'execute',
        payload: { command: 'ls', rm: '-rf /' }
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('denied keys');
    });

    it('allows payload without denied keys', () => {
      const gate = new ToolPermissionGate({
        allow: ['execute'],
        payloadRestrictions: {
          execute: {
            deniedKeys: ['rm', 'delete']
          }
        }
      });

      const result = gate.isAllowed({
        type: 'execute',
        payload: { command: 'ls', path: '/tmp' }
      });

      expect(result.allowed).toBe(true);
    });

    it('uses custom validation function', () => {
      const gate = new ToolPermissionGate({
        allow: ['custom'],
        payloadRestrictions: {
          custom: {
            validate: (payload) => {
              if (payload.dangerous === true) {
                return { allowed: false, reason: 'Dangerous flag set' };
              }
              return { allowed: true };
            }
          }
        }
      });

      const allowed = gate.isAllowed({
        type: 'custom',
        payload: { safe: 'value' }
      });
      expect(allowed.allowed).toBe(true);

      const denied = gate.isAllowed({
        type: 'custom',
        payload: { dangerous: true }
      });
      expect(denied.allowed).toBe(false);
      expect(denied.reason).toBe('Dangerous flag set');
    });

    it('allows action without payload restrictions', () => {
      const gate = new ToolPermissionGate({
        allow: ['simple'],
        payloadRestrictions: {
          other: {
            allowedKeys: ['key']
          }
        }
      });

      const result = gate.isAllowed({
        type: 'simple',
        payload: { any: 'payload' }
      });

      expect(result.allowed).toBe(true);
    });

    it('allows action without payload', () => {
      const gate = new ToolPermissionGate({
        allow: ['action'],
        payloadRestrictions: {
          action: {
            allowedKeys: ['key']
          }
        }
      });

      const result = gate.isAllowed({ type: 'action' });
      expect(result.allowed).toBe(true);
    });
  });
});
