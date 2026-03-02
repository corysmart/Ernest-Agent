import { dirname, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getCanonicalHeartbeatPath } from './heartbeat-path-guard';

interface ParsedTasks {
  pendingByPhase: Map<string, string[]>;
  completedByPhase: Map<string, string[]>;
}

function parseTaskQueue(content: string): ParsedTasks {
  const lines = content.split('\n');
  const taskQueueIndex = lines.findIndex((line) => line.trim() === '## Task Queue');
  if (taskQueueIndex < 0) {
    return { pendingByPhase: new Map(), completedByPhase: new Map() };
  }
  const taskQueueEnd = lines.findIndex(
    (line, idx) => idx > taskQueueIndex && line.startsWith('## ')
  );
  const end = taskQueueEnd >= 0 ? taskQueueEnd : lines.length;

  const pendingByPhase = new Map<string, string[]>();
  const completedByPhase = new Map<string, string[]>();
  let phase = 'Uncategorized';

  for (let i = taskQueueIndex + 1; i < end; i += 1) {
    const line = lines[i] ?? '';
    if (line.startsWith('### ')) {
      phase = line.trim();
      continue;
    }
    const checklistMatch = line.match(/^- \[([xX ])\] (.+)$/);
    if (!checklistMatch) {
      continue;
    }
    const status = checklistMatch[1] ?? ' ';
    const taskText = checklistMatch[2] ?? '';
    const normalizedLine = `- [${status.toLowerCase() === 'x' ? 'x' : ' '}] ${taskText}`;
    if (status.toLowerCase() === 'x') {
      const entries = completedByPhase.get(phase) ?? [];
      entries.push(normalizedLine);
      completedByPhase.set(phase, entries);
    } else {
      const entries = pendingByPhase.get(phase) ?? [];
      entries.push(normalizedLine);
      pendingByPhase.set(phase, entries);
    }
  }

  return { pendingByPhase, completedByPhase };
}

function detectProjectName(content: string): string {
  const focusMatch = content.match(/Active focus:\s*`([^`]+)`/);
  if (focusMatch?.[1]) {
    return focusMatch[1].trim();
  }
  const titleMatch = content.match(/^#\s+HEARTBEAT:\s+Build\s+`([^`]+)`/m);
  if (titleMatch?.[1]) {
    return titleMatch[1].trim();
  }
  return 'default';
}

function renderProjectSection(projectName: string, completedByPhase: Map<string, string[]>): string {
  const lines: string[] = [];
  lines.push(`## Project: ${projectName}`);
  lines.push('');
  lines.push('### Completed Tasks');
  lines.push('');

  const phases = Array.from(completedByPhase.keys());
  if (phases.length === 0) {
    lines.push('- (no completed tasks archived yet)');
    lines.push('');
    return lines.join('\n');
  }

  for (const phase of phases) {
    lines.push(`#### ${phase.replace(/^###\s+/, '')}`);
    for (const item of completedByPhase.get(phase) ?? []) {
      lines.push(item);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function upsertProjectSection(
  existingArchiveContent: string,
  projectName: string,
  section: string
): string {
  const normalizedExisting = existingArchiveContent.trim();
  if (!normalizedExisting) {
    return ['# HEARTBEAT Archive', '', section.trim(), ''].join('\n');
  }

  const escapedProject = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(
    `(^## Project: ${escapedProject}\\n[\\s\\S]*?)(?=\\n## Project: |$)`,
    'm'
  );

  if (sectionRegex.test(existingArchiveContent)) {
    return existingArchiveContent.replace(sectionRegex, `${section.trim()}\n`);
  }

  const separator = existingArchiveContent.endsWith('\n') ? '' : '\n';
  return `${existingArchiveContent}${separator}\n${section.trim()}\n`;
}

export function compactHeartbeatKeepingPending(heartbeatContent: string): string {
  const lines = heartbeatContent.split('\n');
  const taskQueueIndex = lines.findIndex((line) => line.trim() === '## Task Queue');
  if (taskQueueIndex < 0) {
    return heartbeatContent;
  }
  const taskQueueEnd = lines.findIndex(
    (line, idx) => idx > taskQueueIndex && line.startsWith('## ')
  );
  const end = taskQueueEnd >= 0 ? taskQueueEnd : lines.length;

  const { pendingByPhase } = parseTaskQueue(heartbeatContent);

  const rebuiltTaskLines: string[] = ['## Task Queue', ''];
  const phases = Array.from(pendingByPhase.keys());
  for (const phase of phases) {
    rebuiltTaskLines.push(phase);
    for (const item of pendingByPhase.get(phase) ?? []) {
      rebuiltTaskLines.push(item);
    }
    rebuiltTaskLines.push('');
  }
  if (phases.length === 0) {
    rebuiltTaskLines.push('- [ ] (no pending tasks)');
    rebuiltTaskLines.push('');
  }

  const rebuilt = [...lines.slice(0, taskQueueIndex), ...rebuiltTaskLines, ...lines.slice(end)];
  return rebuilt.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function buildHeartbeatArchive(
  heartbeatContent: string,
  existingArchiveContent: string
): string {
  const projectName = detectProjectName(heartbeatContent);
  const { completedByPhase } = parseTaskQueue(heartbeatContent);
  if (completedByPhase.size === 0) {
    return existingArchiveContent;
  }
  const section = renderProjectSection(projectName, completedByPhase);
  return upsertProjectSection(existingArchiveContent, projectName, section);
}

export function getCanonicalHeartbeatArchivePath(): string {
  const workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT ?? resolve(process.cwd(), 'workspace');
  return resolve(workspaceRoot, 'HEARTBEAT_ARCHIVE.md');
}

export interface HeartbeatArchiveSyncResult {
  success: boolean;
  updatedHeartbeat: boolean;
  updatedArchive: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

export function syncHeartbeatArchiveFiles(): HeartbeatArchiveSyncResult {
  const heartbeatPath = getCanonicalHeartbeatPath();
  if (!existsSync(heartbeatPath)) {
    return {
      success: true,
      updatedHeartbeat: false,
      updatedArchive: false,
      skipped: true,
      reason: 'HEARTBEAT.md not found'
    };
  }

  try {
    const heartbeatContent = readFileSync(heartbeatPath, 'utf-8');
    const archivePath = getCanonicalHeartbeatArchivePath();
    const archiveContent = existsSync(archivePath) ? readFileSync(archivePath, 'utf-8') : '';

    const nextArchive = buildHeartbeatArchive(heartbeatContent, archiveContent);
    const compactedHeartbeat = compactHeartbeatKeepingPending(heartbeatContent);

    let updatedArchive = false;
    if (nextArchive !== archiveContent) {
      mkdirSync(dirname(archivePath), { recursive: true });
      writeFileSync(archivePath, nextArchive, 'utf-8');
      updatedArchive = true;
    }

    let updatedHeartbeat = false;
    if (compactedHeartbeat !== heartbeatContent) {
      writeFileSync(heartbeatPath, compactedHeartbeat, 'utf-8');
      updatedHeartbeat = true;
    }

    return {
      success: true,
      updatedHeartbeat,
      updatedArchive
    };
  } catch (error) {
    return {
      success: false,
      updatedHeartbeat: false,
      updatedArchive: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
