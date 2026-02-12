# OpenClaw Workspace Support

For `/agent/run-once`, the server creates `OpenClawWorkspaceAdapter` after request validation/auth checks pass. If the workspace root does not exist, the adapter returns `{}` and execution still continues.

## Files Mapped Into Observations

`OpenClawWorkspaceAdapter` reads these workspace files:

| File | Observation key | Notes |
|------|-----------------|-------|
| `AGENTS.md` | `agents` | Core workspace instructions |
| `SOUL.md` | `soul` | Identity/tone/boundaries |
| `TOOLS.md` | `tools` | Tool notes |
| `USER.md` | `user` | User profile/context |
| `MEMORY.md` | `memory` | Curated long-term memory |
| `BOOTSTRAP.md` | `bootstrap` | Optional startup guidance |
| `HEARTBEAT.md` | `heartbeat` | Optional recurring checklist |
| `memory/YYYY-MM-DD.md` | `memory_YYYY_MM_DD` | Today and yesterday only when `includeDailyMemory` is enabled |
| `skills/<name>/SKILL.md` | `skills` | Concatenated content when `includeSkills: true` |

Behavior from current implementation (`env/openclaw-workspace-adapter.ts`):

- Reads are synchronous (`statSync` + `readFileSync`).
- Only regular files are read (`stat.isFile()` check).
- Files larger than `maxFileBytes` are skipped (default `524288`, i.e. 512 KB).
- Missing/unreadable files are skipped (best-effort).
- Daily memory keys are generated as `memory_YYYY_MM_DD`.

## Adapter Options

- `workspaceRoot`: default `~/.openclaw/workspace` (`~` and `~/...` expansion supported).
- `includeDailyMemory`: default `true` (reads today + yesterday from `memory/`).
- `includeSkills`: default `false`.
- `extraSkillDirs`: additional skill roots (absolute, `~`-prefixed, or workspace-relative).
- `maxFileBytes`: max bytes per file before skipping.
- `getDate`: optional date provider (`YYYY-MM-DD`) for deterministic tests.

For `extraSkillDirs`, workspace-relative entries that escape the workspace root are rejected/skipped.

`OpenClawWorkspaceAdapter` itself does not read environment variables directly. `OPENCLAW_WORKSPACE_ROOT` is applied by server wiring.

## Skills Loading

When `includeSkills` is enabled:

- The adapter scans `<workspaceRoot>/skills/<dir>/SKILL.md`.
- It also scans each configured `extraSkillDirs` root using the same `<dir>/SKILL.md` pattern.
- Skill content is concatenated into a single `skills` value.
- Each entry is prefixed as `## Skill: <name>`.
- Entries are separated with `---`.

The adapter does not parse `~/.openclaw/openclaw.json`; if you keep extra skill directories there, mirror them manually in `extraSkillDirs`.

## Path Safety

- Workspace and skill-file reads are validated with `assertSafePath`.
- Relative `extraSkillDirs` are validated against workspace root before scanning.
- Symlink targets are resolved as part of safety checks (`realpathSync` inside path validation).

## Workspace Defaults in This Repo

This repo ships starter files in `docs/openclaw-workspace-defaults/` and an installer:

```bash
./scripts/install-openclaw-workspace-defaults.sh
# optional custom target:
./scripts/install-openclaw-workspace-defaults.sh /path/to/workspace
```

By default, the installer writes to repo-local `workspace/` (gitignored).

The installer currently copies:

- `AGENTS.md`
- `BOOTSTRAP.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `SOUL.md`
- `TOOLS.md`
- `USER.md`
- `.gitignore`

The installed `.gitignore` ignores the entire workspace by default (except `.gitignore`) to prevent accidental commits of user data.

Notes:

- `IDENTITY.md` is provided by defaults but is not currently mapped into observations by `OpenClawWorkspaceAdapter`.
- The installer does not create `MEMORY.md` or `memory/YYYY-MM-DD.md`; create those as needed.

## Server Integration

In `server/server.ts`, `/agent/run-once` composes observations as:

1. `OpenClawWorkspaceAdapter({ workspaceRoot: process.env.OPENCLAW_WORKSPACE_ROOT ?? '<cwd>/workspace', includeDailyMemory: true })`
2. `RequestObservationAdapter({ timestamp, state, events, conversation_history })`

These are merged through `CompositeObservationAdapter([openclaw, requestAdapter])`, so request keys override workspace keys when both are present. Skills are not loaded by default in server mode (`includeSkills` is not enabled).

Request-side mapping details from current code:

- `observation.state` entries become raw observation keys (non-string values are JSON-stringified).
- `observation.events` is written as a JSON string under `events`.
- `observation.conversation_history` is written as a JSON string under `conversation_history`.
- `observation.timestamp` is applied after normalization (not via the request adapter).

`CompositeObservationAdapter` catches per-adapter errors and continues, so one adapter failure does not abort request execution.
