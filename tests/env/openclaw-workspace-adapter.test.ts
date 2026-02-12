import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { homedir } from 'os';
import { OpenClawWorkspaceAdapter } from '../../env/openclaw-workspace-adapter';

describe('OpenClawWorkspaceAdapter', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'openclaw-test-'));
  });

  afterEach(() => {
    try {
      rmSync(workspaceRoot, { recursive: true });
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

  it('expands ~/ correctly for workspace path', async () => {
    // mkdir under homedir may be denied in sandbox; skip if so
    const homeDir = homedir();
    const homeWorkspace = join(homeDir, 'openclaw-workspace-expand-test');
    try {
      mkdirSync(homeWorkspace, { recursive: true });
    } catch {
      return; // Skip when sandbox denies mkdir under homedir
    }
    try {
      writeFileSync(join(homeWorkspace, 'SOUL.md'), 'Home soul');

      const adapter = new OpenClawWorkspaceAdapter({
        workspaceRoot: '~/openclaw-workspace-expand-test'
      });
      const obs = await adapter.getObservations();

      expect(obs.soul).toBe('Home soul');
    } finally {
      try {
        rmSync(homeWorkspace, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('skips relative extraSkillDirs that escape workspace', async () => {
    const parentDir = join(workspaceRoot, '..');
    const outsiderPath = join(parentDir, 'outside-skills');
    try {
      mkdirSync(outsiderPath, { recursive: true });
      mkdirSync(join(outsiderPath, 'evil'), { recursive: true });
      writeFileSync(join(outsiderPath, 'evil', 'SKILL.md'), 'Evil skill');

      const adapter = new OpenClawWorkspaceAdapter({
        workspaceRoot,
        includeSkills: true,
        extraSkillDirs: ['../outside-skills']
      });
      const obs = await adapter.getObservations();

      expect(obs.skills).toBeUndefined();
    } finally {
      try {
        rmSync(outsiderPath, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('skips files exceeding maxFileBytes', async () => {
    const large = 'x'.repeat(100);
    writeFileSync(join(workspaceRoot, 'SOUL.md'), large);

    const adapter = new OpenClawWorkspaceAdapter({
      workspaceRoot,
      maxFileBytes: 50
    });
    const obs = await adapter.getObservations();

    expect(obs.soul).toBeUndefined();
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
