import { existsSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { getFileWorkspaceRoot } from './file-workspace';

const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;

function expandHomePath(raw: string): string {
  return raw.replace(/^~/, homedir());
}

function getOpenClawWorkspaceRoot(): string {
  const raw = process.env.OPENCLAW_WORKSPACE_ROOT;
  if (typeof raw === 'string' && raw.trim()) {
    return resolve(expandHomePath(raw.trim()));
  }
  return resolve(process.cwd(), 'workspace');
}

function getHeartbeatTargetName(heartbeat: string): string | undefined {
  const match = heartbeat.match(/^#\s*HEARTBEAT:\s*Build\s+`([^`]+)`\s*$/m);
  const name = match?.[1]?.trim();
  if (!name || !SAFE_NAME.test(name)) {
    return undefined;
  }
  return name;
}

function resolveTargetFromHeartbeat(): string | undefined {
  const heartbeatPath = join(getOpenClawWorkspaceRoot(), 'HEARTBEAT.md');
  if (!existsSync(heartbeatPath)) {
    return undefined;
  }

  let heartbeat = '';
  try {
    heartbeat = readFileSync(heartbeatPath, 'utf8');
  } catch {
    return undefined;
  }

  const name = getHeartbeatTargetName(heartbeat);
  if (!name) {
    return undefined;
  }

  const targetPath = resolve(getFileWorkspaceRoot(), name);
  if (!existsSync(targetPath)) {
    return undefined;
  }
  try {
    if (!statSync(targetPath).isDirectory()) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return targetPath;
}

function resolveExistingWorkspaceTarget(name: string): string | undefined {
  if (!name || !SAFE_NAME.test(name)) {
    return undefined;
  }
  const candidate = resolve(getFileWorkspaceRoot(), name);
  if (!existsSync(candidate)) {
    return undefined;
  }
  try {
    if (!statSync(candidate).isDirectory()) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return candidate;
}

function collectPromptCandidates(prompt: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !SAFE_NAME.test(trimmed) || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    candidates.push(trimmed);
  };

  const backtickMatches = prompt.matchAll(/`([a-zA-Z0-9._-]+)`/g);
  for (const match of backtickMatches) {
    add(match[1] ?? '');
  }

  const keywordMatches = prompt.matchAll(
    /\b(?:repo|repository|project|app|workspace|folder|directory)\s+(?:named\s+)?([a-zA-Z0-9._-]+)/gi
  );
  for (const match of keywordMatches) {
    add(match[1] ?? '');
  }

  const locationMatches = prompt.matchAll(
    /\b(?:in|inside|under)\s+([a-zA-Z0-9._-]+)/gi
  );
  for (const match of locationMatches) {
    add(match[1] ?? '');
  }

  const hyphenatedMatches = prompt.matchAll(/\b([a-zA-Z0-9._-]*-[a-zA-Z0-9._-]+)\b/g);
  for (const match of hyphenatedMatches) {
    add(match[1] ?? '');
  }

  return candidates;
}

function resolveTargetFromPrompt(promptHint?: string): string | undefined {
  if (typeof promptHint !== 'string' || !promptHint.trim()) {
    return undefined;
  }
  const candidates = collectPromptCandidates(promptHint);
  for (const name of candidates) {
    const resolved = resolveExistingWorkspaceTarget(name);
    if (resolved) {
      return resolved;
    }
  }
  return undefined;
}

/**
 * Resolve the default directory where Codex should run.
 * Priority:
 * 1) Explicit CODEX_CWD
 * 2) Active heartbeat target directory (when available)
 * 3) Prompt-derived workspace target directory (when available)
 * 4) process.cwd()
 */
export function resolveDefaultCodexCwd(promptHint?: string): string {
  const raw = process.env.CODEX_CWD;
  if (typeof raw === 'string' && raw.trim()) {
    return resolve(expandHomePath(raw.trim()));
  }

  const heartbeatTarget = resolveTargetFromHeartbeat();
  if (heartbeatTarget) {
    return heartbeatTarget;
  }

  const promptTarget = resolveTargetFromPrompt(promptHint);
  if (promptTarget) {
    return promptTarget;
  }

  return process.cwd();
}
