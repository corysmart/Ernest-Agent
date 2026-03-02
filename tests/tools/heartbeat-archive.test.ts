import {
  buildHeartbeatArchive,
  compactHeartbeatKeepingPending
} from '../../tools/heartbeat-archive';

describe('heartbeat archive automation', () => {
  const sampleHeartbeat = `# HEARTBEAT: Build \`ernest-mail\`

## Task Queue

### Phase 5 - Integration
- [x] 5.1 Completed task
- [ ] 5.2 Pending task

### Phase 6 - Attestation
- [x] 6.1 Completed task
- [ ] 6.2 Pending task

## Run Notes
- note`;

  it('keeps only pending checklist items in compacted heartbeat', () => {
    const compacted = compactHeartbeatKeepingPending(sampleHeartbeat);
    expect(compacted).toContain('- [ ] 5.2 Pending task');
    expect(compacted).toContain('- [ ] 6.2 Pending task');
    expect(compacted).not.toContain('- [x] 5.1 Completed task');
    expect(compacted).not.toContain('- [x] 6.1 Completed task');
  });

  it('builds archive section with completed items by phase', () => {
    const archive = buildHeartbeatArchive(sampleHeartbeat, '# HEARTBEAT Archive\n');
    expect(archive).toContain('## Project: ernest-mail');
    expect(archive).toContain('#### Phase 5 - Integration');
    expect(archive).toContain('- [x] 5.1 Completed task');
    expect(archive).toContain('#### Phase 6 - Attestation');
    expect(archive).toContain('- [x] 6.1 Completed task');
  });

  it('replaces existing project section instead of duplicating it', () => {
    const existing = `# HEARTBEAT Archive

## Project: ernest-mail

### Completed Tasks

#### Old Phase
- [x] old

## Project: other-project

### Completed Tasks
- [x] keep`;

    const updated = buildHeartbeatArchive(sampleHeartbeat, existing);
    const matches = updated.match(/## Project: ernest-mail/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(updated).toContain('## Project: other-project');
    expect(updated).toContain('- [x] keep');
    expect(updated).toContain('- [x] 5.1 Completed task');
  });
});
