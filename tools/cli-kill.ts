/**
 * Ensures a spawned CLI process is terminated on abort: sends SIGTERM first,
 * then SIGKILL after graceMs if still running. More reliable than relying solely
 * on spawn({ signal }) for CLIs that ignore signals.
 */

import type { ChildProcess } from 'child_process';

/** Grace period before SIGKILL after SIGTERM. Used by tools and sandboxed runner. */
export const KILL_GRACE_MS = 3000;

const DEFAULT_GRACE_MS = KILL_GRACE_MS;

const isUnix = process.platform !== 'win32';

/**
 * Kills the process (or process group). When useProcessGroup is true and on Unix,
 * sends signal to the process group so forked children are terminated.
 */
function killProcess(proc: ChildProcess, sig: 'SIGTERM' | 'SIGKILL', useProcessGroup: boolean): void {
  if (!proc.pid) return;
  try {
    if (useProcessGroup && isUnix) {
      process.kill(-proc.pid, sig);
    } else {
      proc.kill(sig);
    }
  } catch {
    /* already exited */
  }
}

/**
 * Listens for abort signal and forcefully terminates the child process:
 * SIGTERM on abort, then SIGKILL after graceMs if the process hasn't exited.
 * When useProcessGroup is true, spawn must use detached: true (Unix); kills the
 * process group so forked children are terminated.
 */
export function killOnAbort(
  proc: ChildProcess,
  signal: AbortSignal | undefined,
  graceMs: number = DEFAULT_GRACE_MS,
  useProcessGroup: boolean = true
): void {
  if (!signal) return;

  let timeoutId: NodeJS.Timeout | undefined;

  const clearGraceTimer = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const listener = () => {
    killProcess(proc, 'SIGTERM', useProcessGroup);
    clearGraceTimer();
    timeoutId = setTimeout(() => {
      killProcess(proc, 'SIGKILL', useProcessGroup);
      timeoutId = undefined;
    }, graceMs);
  };

  const onClose = () => {
    clearGraceTimer();
    signal.removeEventListener('abort', listener);
  };

  proc.once('close', onClose);
  signal.addEventListener('abort', listener);

  if (signal.aborted) {
    listener();
  }
}
