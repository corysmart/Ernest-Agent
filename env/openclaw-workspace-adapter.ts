/**
 * ObservationAdapter that reads from an OpenClaw-compatible workspace.
 *
 * Supports the standard OpenClaw workspace layout:
 * - AGENTS.md, SOUL.md, TOOLS.md, USER.md
 * - MEMORY.md (long-term)
 * - memory/YYYY-MM-DD.md (daily logs, today and yesterday)
 * - BOOTSTRAP.md (optional, first-run)
 * - HEARTBEAT.md (optional)
 * - skills/<name>/SKILL.md (when skills enabled)
 *
 * See: https://docs.openclaw.ai/tools/skills-config
 * See: https://docs.openclaw.ai/reference/AGENTS.default
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { assertSafePath } from '../security/path-traversal';
import type { ObservationAdapter } from '../runtime/observation-adapter';
import type { RawTextObservation } from '../runtime/types';

/** Keys used in RawTextObservation for workspace content. */
const OBSERVATION_KEYS = {
  agents: 'AGENTS.md',
  soul: 'SOUL.md',
  tools: 'TOOLS.md',
  user: 'USER.md',
  memory: 'MEMORY.md',
  bootstrap: 'BOOTSTRAP.md',
  heartbeat: 'HEARTBEAT.md'
} as const;

export interface OpenClawWorkspaceAdapterOptions {
  /** Workspace root. Default: ~/.openclaw/workspace. Supports ~ expansion. */
  workspaceRoot?: string;
  /** Include memory/YYYY-MM-DD.md for today and yesterday. Default: true. */
  includeDailyMemory?: boolean;
  /** Include skills from workspace/skills/<name>/SKILL.md. Default: false. */
  includeSkills?: boolean;
  /** Extra skill directories to scan. Must be absolute paths or relative to workspace root. */
  extraSkillDirs?: string[];
  /** Optional clock for deterministic tests. */
  getDate?: () => string;
}

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return join(homedir(), p.slice(2));
  }
  if (p === '~') {
    return homedir();
  }
  return p;
}

function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class OpenClawWorkspaceAdapter implements ObservationAdapter {
  private readonly workspaceRoot: string;
  private readonly includeDailyMemory: boolean;
  private readonly includeSkills: boolean;
  private readonly extraSkillDirs: string[];
  private readonly getDate: () => string;

  constructor(options: OpenClawWorkspaceAdapterOptions = {}) {
    const root = options.workspaceRoot ?? '~/.openclaw/workspace';
    this.workspaceRoot = expandPath(root);
    this.includeDailyMemory = options.includeDailyMemory ?? true;
    this.includeSkills = options.includeSkills ?? false;
    this.extraSkillDirs = options.extraSkillDirs ?? [];
    this.getDate = options.getDate ?? (() => formatDateLocal(new Date()));
  }

  async getObservations(): Promise<RawTextObservation> {
    const result: RawTextObservation = {};

    if (!existsSync(this.workspaceRoot)) {
      return result;
    }

    for (const [key, filename] of Object.entries(OBSERVATION_KEYS)) {
      const filePath = join(this.workspaceRoot, filename);
      if (existsSync(filePath)) {
        try {
          assertSafePath(this.workspaceRoot, filePath);
          result[key] = readFileSync(filePath, 'utf8');
        } catch {
          /* skip on path error */
        }
      }
    }

    if (this.includeDailyMemory) {
      const memoryDir = join(this.workspaceRoot, 'memory');
      if (existsSync(memoryDir)) {
        const today = this.getDate();
        const yesterday = this.getYesterday(today);
        for (const date of [today, yesterday]) {
          const filePath = join('memory', `${date}.md`);
          const fullPath = join(this.workspaceRoot, filePath);
          if (existsSync(fullPath)) {
            try {
              assertSafePath(this.workspaceRoot, filePath);
              result[`memory_${date.replace(/-/g, '_')}`] = readFileSync(fullPath, 'utf8');
            } catch {
              /* skip */
            }
          }
        }
      }
    }

    if (this.includeSkills) {
      const skillsResult: string[] = [];
      const workspaceSkills = join(this.workspaceRoot, 'skills');
      const dirsToScan: { base: string; path: string }[] = [
        { base: this.workspaceRoot, path: workspaceSkills }
      ];
      for (const d of this.extraSkillDirs) {
        const resolved = d.startsWith('/') || d.startsWith('~') ? expandPath(d) : join(this.workspaceRoot, d);
        dirsToScan.push({ base: resolved, path: resolved });
      }
      for (const { base, path: skillDir } of dirsToScan) {
        if (!existsSync(skillDir)) continue;
        let entries: { name: string; isDirectory: () => boolean }[];
        try {
          entries = readdirSync(skillDir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          const skillPath = join(skillDir, ent.name, 'SKILL.md');
          if (!existsSync(skillPath)) continue;
          try {
            assertSafePath(base, skillPath);
            const content = readFileSync(skillPath, 'utf8');
            skillsResult.push(`## Skill: ${ent.name}\n${content}`);
          } catch {
            /* skip on path validation failure */
          }
        }
      }
      if (skillsResult.length > 0) {
        result.skills = skillsResult.join('\n\n---\n\n');
      }
    }

    return result;
  }

  private getYesterday(today: string): string {
    const parts = today.split('-').map(Number);
    const y = parts[0] ?? 0;
    const m = (parts[1] ?? 1) - 1;
    const day = parts[2] ?? 1;
    const d = new Date(y, m, day);
    d.setDate(d.getDate() - 1);
    return formatDateLocal(d);
  }
}
