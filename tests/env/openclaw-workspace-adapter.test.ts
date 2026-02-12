import { mkdtempSync, mkdirSync, writeFileSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { OpenClawWorkspaceAdapter } from '../../env/openclaw-workspace-adapter';

describe('OpenClawWorkspaceAdapter', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'openclaw-test-'));
  });

  afterEach(() => {
    try {
      rmdirSync(workspaceRoot, { recursive: true });
    } catch {
      /* ignore */
    }
  });

  it('returns empty when workspace does not exist', async () => {
    const adapter = new OpenClawWorkspaceAdapter({
      workspaceRoot: join(tmpdir(), 'nonexistent-openclaw-workspace-xyz')
    });
    const obs = await adapter.getObservations();
    expect(obs).toEqual({});
  });

  it('reads AGENTS.md, SOUL.md, TOOLS.md when present', async () => {
    writeFileSync(join(workspaceRoot, 'AGENTS.md'), '# AGENTS');
    writeFileSync(join(workspaceRoot, 'SOUL.md'), '# SOUL');
    writeFileSync(join(workspaceRoot, 'TOOLS.md'), '# TOOLS');

    const adapter = new OpenClawWorkspaceAdapter({ workspaceRoot });
    const obs = await adapter.getObservations();

    expect(obs.agents).toBe('# AGENTS');
    expect(obs.soul).toBe('# SOUL');
    expect(obs.tools).toBe('# TOOLS');
  });

  it('reads daily memory when includeDailyMemory is true', async () => {
    mkdirSync(join(workspaceRoot, 'memory'), { recursive: true });
    const today = '2025-02-12';
    writeFileSync(join(workspaceRoot, 'memory', `${today}.md`), 'Today log');

    const adapter = new OpenClawWorkspaceAdapter({
      workspaceRoot,
      getDate: () => today
    });
    const obs = await adapter.getObservations();

    expect(obs.memory_2025_02_12).toBe('Today log');
  });

  it('reads skills when includeSkills is true', async () => {
    mkdirSync(join(workspaceRoot, 'skills', 'my-skill'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'skills', 'my-skill', 'SKILL.md'), 'Skill content');

    const adapter = new OpenClawWorkspaceAdapter({
      workspaceRoot,
      includeSkills: true
    });
    const obs = await adapter.getObservations();

    expect(obs.skills).toContain('## Skill: my-skill');
    expect(obs.skills).toContain('Skill content');
  });

  it('excludes skills when includeSkills is false', async () => {
    mkdirSync(join(workspaceRoot, 'skills', 'my-skill'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'skills', 'my-skill', 'SKILL.md'), 'Skill content');

    const adapter = new OpenClawWorkspaceAdapter({
      workspaceRoot,
      includeSkills: false
    });
    const obs = await adapter.getObservations();

    expect(obs.skills).toBeUndefined();
  });

  it('reads USER.md and MEMORY.md when present', async () => {
    writeFileSync(join(workspaceRoot, 'USER.md'), '# User');
    writeFileSync(join(workspaceRoot, 'MEMORY.md'), '# Memory');

    const adapter = new OpenClawWorkspaceAdapter({ workspaceRoot });
    const obs = await adapter.getObservations();

    expect(obs.user).toBe('# User');
    expect(obs.memory).toBe('# Memory');
  });
});
