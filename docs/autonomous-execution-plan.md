# Autonomous Execution Implementation Plan

## Goal

Enable Ernest Agent to run fully autonomously when the server is running, using HEARTBEAT.md as a task source and a periodic heartbeat trigger.

## Implementation Status

| Piece | Status |
|-------|--------|
| 1. read_file | Done |
| 2. list_dir | Done |
| 3. run_command | Done |
| 4. write_file | Done |
| 5. Multi-act loop | Done |
| 6. Heartbeat trigger | Done |
| 7. Registry, permissions, docs | Done |
| 8. create_workspace + risky mode | Done |

## Env Vars

- `FILE_WORKSPACE_ROOT` – root for file tools (read_file, list_dir, run_command, write_file). Fallback: `CODEX_CWD`, then `process.cwd()`.
- `RISKY_WORKSPACE_MODE` – set to `true` (or `FILE_WORKSPACE_MODE=risky`) to allow broader workspace root.
- `RISKY_WORKSPACE_ROOT` – optional explicit root for risky mode. Default: parent of safe workspace root.
- `READ_FILE_MAX_BYTES` – max file size for read_file (default 524288).
- `RUN_COMMAND_TIMEOUT_MS` – command timeout for run_command (default 60000).
- `MAX_MULTI_ACT_STEPS` – max tool calls per run (default 10, cap 50). Set to 1 to disable multi-act.
- `HEARTBEAT_ENABLED` – set to `true` to enable periodic heartbeat runs.
- `HEARTBEAT_INTERVAL_MS` – interval between heartbeat runs (default 300000 = 5 min).

## Pieces (in order)

### 1. read_file
- **Purpose:** Let the agent inspect file contents without calling Codex.
- **Inputs:** `path` (required), optional `encoding` (default utf-8).
- **Safety:** Path must be within workspace (assertSafePath). Workspace root: FILE_WORKSPACE_ROOT || CODEX_CWD || process.cwd().
- **Returns:** `{ success, content?, error? }`

### 2. list_dir
- **Purpose:** Let the agent see project layout between steps.
- **Inputs:** `path` (optional, default "."), optional `recursive` (boolean, default false).
- **Safety:** Same workspace constraint as read_file.
- **Returns:** `{ success, entries: [{ name, isFile, isDirectory }], error? }`

### 3. run_command
- **Purpose:** Run shell commands (npm test, curl, etc.) without Codex cost.
- **Inputs:** `command` (required), optional `cwd` (within workspace).
- **Safety:** Workspace constraint, TOOL_TIMEOUT_MS (existing). Consider allowlist for production.
- **Returns:** `{ success, stdout?, stderr?, exitCode?, error? }`

### 4. write_file
- **Purpose:** Agent can update HEARTBEAT.md / task state between runs.
- **Inputs:** `path` (required), `content` (required).
- **Safety:** Path within workspace. No writing outside. Create dirs if needed.
- **Returns:** `{ success, error? }`

### 4b. create_workspace
- **Purpose:** Create a new project directory (for example `ernest-mail`) before writing code.
- **Inputs:** `name` or `path`, optional `allowExisting`, `createReadme`, `readmeTitle`.
- **Safety:** Path must remain under resolved file workspace root.
- **Returns:** `{ success, created, path, workspaceRoot, riskyMode, error? }`

### 5. Multi-act loop
- **Purpose:** Agent chains multiple tool calls in one run.
- **Mechanism:** After each act, feed (action + result) back; re-query LLM for next action. Add `complete_run` action type to signal done.
- **Config:** MAX_MULTI_ACT_STEPS (default 10), env-configurable.
- **Flow:** observe → plan → act → [observe+history → plan → act] × N until complete_run or limit.

### 6. Heartbeat trigger
- **Purpose:** Periodically run the agent when server is up.
- **Config:** HEARTBEAT_ENABLED (default false), HEARTBEAT_INTERVAL_MS (default 300000 = 5 min).
- **Flow:** setInterval → build observation from OpenClaw → create default goal "Process heartbeat" → run agent (with multi-act).
- **Workspace:** Use OPENCLAW_WORKSPACE_ROOT for observation; FILE_WORKSPACE_ROOT for file tools when same as project.

### 7. Registry, permissions, docs
- Add all new tools to registry and permission gate.
- Document in tools/README.md and docs.
- Tests for each tool.

## File workspace root

- Env: `FILE_WORKSPACE_ROOT` (optional)
- Fallback: `CODEX_CWD` (optional)
- Fallback: `process.cwd()`
- Supports `~` expansion.

## HEARTBEAT.md convention

When heartbeat trigger runs:
- Observation includes `heartbeat` key from HEARTBEAT.md.
- Default goal title: "Process heartbeat"
- Agent reads task list, does work (read_file, invoke_codex, etc.), writes progress back via write_file to HEARTBEAT.md or a companion file.
