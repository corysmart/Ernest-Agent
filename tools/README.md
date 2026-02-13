# Agent Tools

Tools the agent can invoke when given appropriate goals.

## File Workspace Tools (Autonomous Execution)

These tools let the agent read, list, run commands, and write files within a workspace. They are scoped by `FILE_WORKSPACE_ROOT` (fallback: `CODEX_CWD`, then `process.cwd()`). Supports `~` expansion.

Default mode is safe. To intentionally allow sibling project bootstrapping (e.g., creating `ernest-mail` next to this repo), enable risky mode:

- `RISKY_WORKSPACE_MODE=true` or `FILE_WORKSPACE_MODE=risky`
- Optional `RISKY_WORKSPACE_ROOT=/path/to/repositories` (defaults to parent of safe root)

### read_file

Read file contents from the workspace. Used to inspect HEARTBEAT.md, source files, etc.

| Input    | Type   | Description                          |
|----------|--------|--------------------------------------|
| path     | string | File path within workspace (required) |
| encoding | string | Encoding (default utf-8)             |

**Returns:** `{ success, content?, error? }`

**Env:** `READ_FILE_MAX_BYTES` (default 524288). Larger files are rejected.

### list_dir

List directory contents. Used to see project layout between steps.

| Input     | Type    | Description                             |
|-----------|---------|-----------------------------------------|
| path      | string  | Directory path (optional, default ".")   |
| recursive | boolean | Include subdirectories (default false)   |

**Returns:** `{ success, entries: [{ name, isFile, isDirectory }], error? }`

### run_command

Run shell commands (e.g. `npm test`, `curl`) without Codex.

| Input    | Type   | Description                                  |
|----------|--------|----------------------------------------------|
| command  | string | Command to run (required)                    |
| cwd      | string | Working directory (optional, within workspace) |
| timeoutMs| number | Max execution time in ms (optional)           |

**Returns:** `{ success, stdout?, stderr?, exitCode?, error? }`

**Env:** `RUN_COMMAND_TIMEOUT_MS` (default 60000).

### write_file

Write content to a file. Used to update HEARTBEAT.md or task state.

| Input   | Type   | Description                          |
|---------|--------|--------------------------------------|
| path    | string | File path within workspace (required) |
| content | string | Content to write (required)          |

**Returns:** `{ success, error? }`

Creates parent directories if needed.

### create_workspace

Creates a new workspace directory under the resolved file workspace root. Useful for starting a separate project repo.

| Input       | Type    | Description                                           |
|-------------|---------|-------------------------------------------------------|
| name        | string  | Workspace name (used when `path` not provided)        |
| path        | string  | Relative path under workspace root (overrides `name`) |
| allowExisting | boolean | Allow non-empty existing workspace (default false)  |
| createReadme | boolean | Create `README.md` if missing (default true)         |
| readmeTitle | string  | Optional README title                                 |

**Returns:** `{ success, created, path, workspaceRoot, riskyMode, error? }`

Path segments may only contain letters, numbers, dot, dash, underscore—no spaces or suffixes like ` 2` or ` copy` (avoids duplicates from iCloud/agent re-runs). Use the exact canonical name; if the workspace exists, pass `allowExisting: true`.

## CLI Tools (invoke_codex, invoke_claude)

These tools run Codex and Claude Code from the terminal, using your existing subscriptions instead of separate API keys.

**Default inference:** When no `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set, the agent uses Codex as the default LLM (no API key required).

## Installation

### Codex CLI (OpenAI)

```bash
# npm
npm install -g @openai/codex

# or Homebrew
brew install codex
```

Authenticate: run `codex` once and sign in with your ChatGPT account.

### Claude Code CLI (Anthropic)

```bash
# Homebrew (recommended on macOS)
brew install claude-code

# or npm
npm install -g @anthropic-ai/claude-code
```

Authenticate: run `claude auth login` or set `ANTHROPIC_API_KEY`.

## Usage

The agent can call these tools when given appropriate goals or when the LLM selects them.

**invoke_codex** – `actionPayload: { prompt: "Your instruction" }` or `{ goal: "..." }` (goal is an alias for prompt)

| Input   | Type   | Description                                         |
|---------|--------|-----------------------------------------------------|
| prompt  | string | Instruction (required; `goal` is accepted as alias) |
| cwd     | string | Working directory (default: `process.cwd()` or `CODEX_CWD`) |

Set `CODEX_CWD` to run Codex (and the LLM adapter) in a specific directory—e.g. a clone with `dev` checked out. Supports `~` expansion.

```bash
# Equivalent terminal command
codex "Summarize this project."
```

**invoke_claude** – `actionPayload: { prompt: "Your instruction" }`

```bash
# Equivalent terminal command
claude "Create a Python script that prints 'Hello, world!'"
```

### invoke_claude options

| Input        | Type   | Description                                  |
|-------------|--------|----------------------------------------------|
| prompt      | string | Main instruction (required unless promptFile) |
| promptFile  | string | Path to file with longer instructions        |
| systemPrompt| string | System prompt, e.g. "You are a concise coding assistant." |
| cwd         | string | Working directory (default: process.cwd())   |

Example with system prompt:

```bash
claude --system-prompt "You are a concise coding assistant." "Review this pull request"
```

## Email and Scheduling Tools

### create_test_email_account

Creates a disposable test email account via Ethereal. Saves credentials to `data/email-config.json` so `send_email` works immediately. **For testing only**—emails appear in Ethereal's web inbox, not real recipients.

**Example:** "Set up email for testing" – the agent can call this to create an account and configure sending.

### save_email_config

Saves SMTP credentials to the config file so `send_email` works. Use when the user provides credentials (host, port, user, pass). Never writes to `.env`.

| Input    | Type   | Description                        |
|----------|--------|------------------------------------|
| host     | string | SMTP host (required)               |
| user     | string | SMTP username (required)           |
| pass     | string | SMTP password (required)           |
| port     | number | Port (default 587)                 |
| from     | string | From address (defaults to user)    |

**Example:** "Save my Gmail SMTP: host smtp.gmail.com, user me@gmail.com, pass xxxx" – the agent extracts and saves.

### send_email

Sends an email via SMTP. Uses credentials from env vars or the config file (populated by `create_test_email_account` or `save_email_config`).

| Input   | Type   | Description                                   |
|---------|--------|-----------------------------------------------|
| to      | string | Recipient email (required)                    |
| subject | string | Subject line (required)                        |
| body    | string | Plain text body (or use text, content)         |
| html    | string | HTML body (optional; use with or instead of body) |

**Env config:** `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (defaults to SMTP_USER).

**Example:** Tell the agent "Email me a summary at user@example.com" – it can call `send_email` with the summary.

### schedule_task

Registers a recurring task. Tasks are persisted to a JSON file. A scheduler (separate process or server feature) must run to execute them.

| Input           | Type   | Description                                              |
|----------------|--------|----------------------------------------------------------|
| schedule       | string | Cron expression (required, e.g. `0 9 * * *` for 9am daily) |
| goalTitle      | string | What the agent should do when the task runs (required)   |
| goalDescription| string | Optional details                                         |
| recipientEmail | string | Email to send results to (optional)                      |

**Env config:** `SCHEDULED_TASKS_PATH` (default: `data/scheduled-tasks.json`).

**Example:** "Schedule a good morning email at 9am every day with an update on my agents" – the agent can call `schedule_task` with `schedule: "0 9 * * *"`, `goalTitle: "Send good morning update with agent status"`, `recipientEmail: "me@example.com"`.

**Note:** A scheduler process that reads this file and triggers runs is not yet included. The task is stored for when you add one.

### get_recent_runs

Returns a summary of recent agent runs from the observability store.

| Input | Type   | Description                    |
|-------|--------|--------------------------------|
| limit | number | Max runs to return (default 10) |

**Requirements:** `OBS_UI_ENABLED=true` to persist runs. Uses `OBS_UI_DATA_DIR` (default: `data/observability`).

**Example:** For a "good morning update" goal, the agent can call `get_recent_runs` first to summarize status, then `send_email` to deliver it.
