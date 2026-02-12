# OpenClaw Workspace Support

Ernest Agent **always** reads from an OpenClaw-compatible workspace to inject context into the observation pipeline. The HTTP server merges workspace content (AGENTS.md, SOUL.md, TOOLS.md, etc.) with each request's observation. This enables interoperability with [OpenClaw](https://github.com/openclaw/openclaw) workspaces and prompt templates.

## Overview

The `OpenClawWorkspaceAdapter` implements `ObservationAdapter` and reads the standard OpenClaw workspace layout:

| File | Observation key | Description |
|------|-----------------|-------------|
| AGENTS.md | agents | Workspace guidelines, session start, memory system |
| SOUL.md | soul | Identity, tone, boundaries |
| TOOLS.md | tools | Local notes (cameras, SSH, TTS, etc.) |
| USER.md | user | Who the user is |
| MEMORY.md | memory | Long-term curated memory |
| BOOTSTRAP.md | bootstrap | First-run instructions (optional) |
| HEARTBEAT.md | heartbeat | Heartbeat checklist (optional) |
| memory/YYYY-MM-DD.md | memory_YYYY_MM_DD | Daily logs (today and yesterday) |
| skills/\<name\>/SKILL.md | skills | Skill definitions (when enabled) |

## Usage

```typescript
import { OpenClawWorkspaceAdapter } from './env/openclaw-workspace-adapter';
import { CompositeObservationAdapter, StaticObservationAdapter, ObservationNormalizer } from './runtime';

const openclaw = new OpenClawWorkspaceAdapter({
  workspaceRoot: '~/.openclaw/workspace',
  includeDailyMemory: true,
  includeSkills: true,
  extraSkillDirs: ['~/Projects/my-skills']
});

// Combine with other adapters (later overrides earlier for same keys)
const adapter = new CompositeObservationAdapter([
  openclaw,
  new StaticObservationAdapter({ user_message: 'Hello' })
]);

const normalizer = new ObservationNormalizer();
const raw = await adapter.getObservations();
const observation = normalizer.normalize(raw);
```

## Options

- **workspaceRoot**: Default `~/.openclaw/workspace`. Set `OPENCLAW_WORKSPACE_ROOT` to override. Supports `~` expansion.
- **includeDailyMemory**: Include `memory/YYYY-MM-DD.md` for today and yesterday. Default: true.
- **includeSkills**: Include `workspace/skills/<name>/SKILL.md`. Default: false.
- **extraSkillDirs**: Additional directories to scan for skills. Absolute paths or relative to workspace. Relative paths must not escape the workspace root (`..` is rejected).
- **maxFileBytes**: Max bytes per file before skipping. Default: 524288 (512KB).
- **getDate**: Override for deterministic tests (`() => 'YYYY-MM-DD'`). Default uses local date (not UTC).

## Skills Config

OpenClaw's skills config lives in `~/.openclaw/openclaw.json` under `skills`. The adapter does not parse that file. To mirror it:

- Use `extraSkillDirs` for paths from `skills.load.extraDirs`
- Set `includeSkills: true` to load `workspace/skills/*/SKILL.md`

## Security

- Path validation ensures reads stay within the workspace (and extra skill dirs). Symlinks are resolved.
- Files are read synchronously; large workspaces may block. Use for bounded contexts.

## Templates

OpenClaw provides default templates for AGENTS, BOOTSTRAP, IDENTITY, SOUL, TOOLS, USER. Copy them to your workspace:

```bash
mkdir -p ~/.openclaw/workspace
cp /path/to/openclaw/docs/reference/templates/AGENTS.md ~/.openclaw/workspace/
cp /path/to/openclaw/docs/reference/templates/SOUL.md ~/.openclaw/workspace/
cp /path/to/openclaw/docs/reference/templates/TOOLS.md ~/.openclaw/workspace/
```

See [OpenClaw reference](https://docs.openclaw.ai/reference/AGENTS.default) for full template docs.

This repo includes defaults in `docs/openclaw-workspace-defaults/` and an installer script that copies a `.gitignore` so the entire workspace is ignored by default (SOUL, HEARTBEAT, MEMORY, etc. are updated by the agent and contain user data).

```bash
./scripts/install-openclaw-workspace-defaults.sh
```

## Server Integration

The HTTP server (`/agent/run-once`) always injects OpenClaw workspace content into every request. Workspace observations (agents, soul, tools, user, memory, etc.) are merged with the request body's observation; request keys override workspace keys when both exist. Set `OPENCLAW_WORKSPACE_ROOT` to use a custom workspace path (default: `~/.openclaw/workspace`).
