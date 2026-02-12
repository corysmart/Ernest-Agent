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

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
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
  /** Extra skill directories to scan. Absolute paths or relative to workspace root. Relative paths must not escape workspace (.. rejected). */
  extraSkillDirs?: string[];
  /** Max bytes per file before skipping. Default: 524288 (512KB). */
  maxFileBytes?: number;
  /** Optional clock for deterministic tests. */
  getDate?: () => string;
  /** Optional homedir for ~ expansion. Used in tests to avoid writing under real homedir. */
  getHomedir?: () => string;
}

function expandPath(p: string, homeDir?: string): string {
  const home = homeDir ?? homedir();
  if (p.startsWith('~/')) {
    return join(home, p.slice(2));
  }
  if (p === '~') {
    return home;
  }
  return p;
}

function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DEFAULT_MAX_FILE_BYTES = 524288; // 512KB

export class OpenClawWorkspaceAdapter implements ObservationAdapter {
  private readonly workspaceRoot: string;
  private readonly includeDailyMemory: boolean;
  private readonly includeSkills: boolean;
  private readonly extraSkillDirs: string[];
  private readonly maxFileBytes: number;
  private readonly getDate: () => string;
  private readonly getHomedir: () => string;

  constructor(options: OpenClawWorkspaceAdapterOptions = {}) {
    const root = options.workspaceRoot ?? '~/.openclaw/workspace';
    this.getHomedir = options.getHomedir ?? (() => homedir());
    this.workspaceRoot = expandPath(root, this.getHomedir());
    this.includeDailyMemory = options.includeDailyMemory ?? true;
    this.includeSkills = options.includeSkills ?? false;
    this.extraSkillDirs = options.extraSkillDirs ?? [];
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    this.getDate = options.getDate ?? (() => formatDateLocal(new Date()));
  }

  private readFileIfWithinLimit(filePath: string, baseForValidation?: string): string | undefined {
    try {
      const stat = statSync(filePath);
      if (!stat.isFile() || stat.size > this.maxFileBytes) {
        return undefined;
      }
      const base = baseForValidation ?? this.workspaceRoot;
      assertSafePath(base, filePath);
      return readFileSync(filePath, 'utf8');
    } catch {
      return undefined;
    }
  }

  async getObservations(): Promise<RawTextObservation> {
    const result: RawTextObservation = {};

    if (!existsSync(this.workspaceRoot)) {
      return result;
    }

    for (const [key, filename] of Object.entries(OBSERVATION_KEYS)) {
      const filePath = join(this.workspaceRoot, filename);
      if (existsSync(filePath)) {
        const content = this.readFileIfWithinLimit(filePath);
        if (content !== undefined) {
          result[key] = content;
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
            const content = this.readFileIfWithinLimit(fullPath);
            if (content !== undefined) {
              result[`memory_${date.replace(/-/g, '_')}`] = content;
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
        const isAbsolute = d.startsWith('/') || d.startsWith('~');
        const resolved = isAbsolute ? expandPath(d, this.getHomedir()) : join(this.workspaceRoot, d);
        if (!isAbsolute) {
          try {
            assertSafePath(this.workspaceRoot, resolved);
          } catch {
            continue;
          }
        }
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
          const content = this.readFileIfWithinLimit(skillPath, base);
          if (content !== undefined) {
            skillsResult.push(`## Skill: ${ent.name}\n${content}`);
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
