export function buildCodexExecArgs(): string[] {
  const args = ['exec'];
  const riskyMode = isRiskyWorkspaceModeEnabled();

  const modelOverride = cleanEnvValue(process.env.CODEX_MODEL);
  if (modelOverride) {
    args.push('--model', modelOverride);
  }

  const sandboxMode = cleanEnvValue(process.env.CODEX_SANDBOX_MODE) ?? (riskyMode ? 'workspace-write' : undefined);
  if (sandboxMode) {
    args.push('--sandbox', sandboxMode);
  }

  if (riskyMode) {
    args.push('--skip-git-repo-check');
  }

  return args;
}

function cleanEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
    return undefined;
  }
  return trimmed;
}

function isRiskyWorkspaceModeEnabled(): boolean {
  if (process.env.RISKY_WORKSPACE_MODE === 'true' || process.env.RISKY_WORKSPACE_MODE === '1') {
    return true;
  }
  const mode = process.env.FILE_WORKSPACE_MODE;
  return typeof mode === 'string' && mode.toLowerCase() === 'risky';
}
