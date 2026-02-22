import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface WorkspaceRunLockHandle {
  release(): void;
}

interface AcquireWorkspaceRunLockOptions {
  workspaceRoot: string;
  owner: string;
  waitMs?: number;
  staleMs?: number;
  retryMs?: number;
}

const DEFAULT_WAIT_MS = 5000;
const DEFAULT_STALE_MS = 15 * 60 * 1000;
const DEFAULT_RETRY_MS = 100;

interface LockOwnerData {
  owner?: string;
  createdAt?: number;
  pid?: number;
}

export async function acquireWorkspaceRunLock(
  options: AcquireWorkspaceRunLockOptions
): Promise<WorkspaceRunLockHandle | null> {
  const lockDir = join(options.workspaceRoot, '.ernest-run.lock');
  const ownerPath = join(lockDir, 'owner.json');
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const deadline = Date.now() + Math.max(0, waitMs);

  while (Date.now() <= deadline) {
    try {
      mkdirSync(lockDir);
      writeFileSync(ownerPath, JSON.stringify({
        owner: options.owner,
        createdAt: Date.now(),
        pid: process.pid
      }), 'utf-8');
      return {
        release: () => {
          try {
            rmSync(lockDir, { recursive: true, force: true });
          } catch {
            // best effort
          }
        }
      };
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      if (shouldReclaimLock(lockDir, staleMs)) {
        try {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        } catch {
          // keep waiting
        }
      }
      await sleep(retryMs);
    }
  }

  return null;
}

export function readWorkspaceRunLockOwner(workspaceRoot: string): string | undefined {
  const ownerPath = join(workspaceRoot, '.ernest-run.lock', 'owner.json');
  try {
    const parsed = readLockOwnerData(ownerPath);
    if (!parsed) {
      return undefined;
    }
    return typeof parsed.owner === 'string' ? parsed.owner : undefined;
  } catch {
    return undefined;
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'EEXIST'
  );
}

function shouldReclaimLock(lockDir: string, staleMs: number): boolean {
  const ownerPath = join(lockDir, 'owner.json');
  const ownerData = readLockOwnerData(ownerPath);
  if (!ownerData) {
    // Lock exists without metadata; treat as stale/corrupt and recover.
    return true;
  }
  if (typeof ownerData.pid === 'number' && ownerData.pid > 0 && !isProcessAlive(ownerData.pid)) {
    return true;
  }
  return isStaleByMtime(lockDir, staleMs);
}

function isStaleByMtime(lockDir: string, staleMs: number): boolean {
  try {
    const stat = statSync(lockDir);
    return Date.now() - stat.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

function readLockOwnerData(ownerPath: string): LockOwnerData | null {
  try {
    const content = readFileSync(ownerPath, 'utf-8');
    return JSON.parse(content) as LockOwnerData;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  if (pid === process.pid) {
    return true;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'ESRCH') {
      return false;
    }
    // EPERM and unknown errors are treated as "still alive"/not reclaimable.
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
