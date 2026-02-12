/**
 * Ensures a spawned CLI process is terminated on abort: sends SIGTERM first,
 * then SIGKILL after graceMs if still running. More reliable than relying solely
 * on spawn({ signal }) for CLIs that ignore signals.
 */

import type { ChildProcess } from 'child_process';

const DEFAULT_GRACE_MS = 3000;

/**
 * Listens for abort signal and forcefully terminates the child process:
 * SIGTERM on abort, then SIGKILL after graceMs if the process hasn't exited.
 * Cleans up the grace timer when the process closes to avoid killing an already-dead PID.
 */
export function killOnAbort(
  proc: ChildProcess,
  signal: AbortSignal | undefined,
  graceMs: number = DEFAULT_GRACE_MS
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
    try {
      proc.kill('SIGTERM');
    } catch {
      /* already exited */
    }
    clearGraceTimer();
    timeoutId = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already exited */
      }
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
