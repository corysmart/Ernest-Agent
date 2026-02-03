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
});
