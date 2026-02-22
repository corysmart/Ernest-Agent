import { resolve } from 'path';

export function getCanonicalHeartbeatPath(): string {
  const workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT ?? resolve(process.cwd(), 'workspace');
  return resolve(workspaceRoot, 'HEARTBEAT.md');
}

export function getHeartbeatPathError(targetPath: string): string | null {
  const normalizedTarget = normalizePath(targetPath);
  const normalizedCanonical = normalizePath(getCanonicalHeartbeatPath());

  const isWorkspaceHeartbeat = normalizedTarget.endsWith('/workspace/HEARTBEAT.md');
  if (!isWorkspaceHeartbeat) {
    return null;
  }
  if (normalizedTarget === normalizedCanonical) {
    return null;
  }

  return `Invalid HEARTBEAT path. Use canonical path: ${getCanonicalHeartbeatPath()}`;
}

function normalizePath(pathValue: string): string {
  return resolve(pathValue).replace(/\\/g, '/');
}
