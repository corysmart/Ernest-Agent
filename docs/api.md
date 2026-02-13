# API Reference

HTTP API for the Ernest agent server.

## Endpoints

### GET /health

Health check. No authentication required.

**Response (200)**
```json
{"status":"ok"}
```

### POST /agent/run-once

Run one agent loop. Request body:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| observation | object | Yes | Observation from the environment |
| observation.timestamp | number | No | Unix timestamp (ms). Default: current time |
| observation.state | object | Yes | Key-value state (e.g., `user_message`) |
| observation.events | string[] | No | Optional event list |
| observation.conversation_history | array | No | Multi-turn context for follow-ups. Each entry: `{ role: "user" \| "assistant", content: string }`. Use when the agent (or Codex) asked a clarifying question and the user is responding. |
| goal | object | No | Goal to pursue this run |
| goal.id | string | Yes | Unique goal ID |
| goal.title | string | Yes | Goal title |
| goal.description | string | No | Optional description |
| goal.priority | number | No | Default: 1 |
| goal.horizon | string | No | `short` or `long`. Default: `short` |
| goal.candidateActions | array | No | Predefined candidate actions |
| autoRespond | boolean | No | When true, inject default "Respond to user" goal if user_message exists and no explicit goal. See also AUTO_RESPOND env. Disabled by default. |
| tenantId | string | No | Tenant scope (when authenticated) |
| dryRun | string | No | `with-llm` or `without-llm` to skip execution |

**autoRespond**

- Set `autoRespond: true` in the request body, or `AUTO_RESPOND=true` in the environment, to inject a default "Respond to user" goal when `observation.state.user_message` is present and no explicit goal is provided.
- Default behavior: agent returns idle when only user_message exists and no goal. Auto-respond is disabled by default for security.

**dryRun**

- `with-llm`: Calls LLM (Codex, OpenAI, etc.), validates output, returns decision. Skips act, memory, self-model updates. Useful to see what the model would decide without running tools. When no explicit goal is provided but `user_message` exists, the server auto-injects a "Respond to user" goal so the LLM always responds (no need for `autoRespond`).
- `without-llm`: Skips LLM call; uses stub decision from first candidate action. No API cost. Skips act, memory, self-model updates.

**Response (200)**

| Status | Description |
|--------|-------------|
| completed | Action executed successfully |
| idle | No goal to process |
| dry_run | Dry run; decision returned, no side effects |
| error | Validation, permission, or execution error |

**Completed**
```json
{
  "status": "completed",
  "decision": {
    "actionType": "pursue_goal",
    "actionPayload": {},
    "confidence": 0.9,
    "reasoning": "..."
  },
  "actionResult": { "success": true },
  "selectedGoalId": "g1",
  "stateTrace": ["observe", "retrieve_memory", ...]
}
```

**Dry run**
```json
{
  "status": "dry_run",
  "decision": { "actionType": "...", ... },
  "actionResult": { "success": true, "skipped": true },
  "dryRunMode": "with-llm",
  "selectedGoalId": "g1",
  "stateTrace": [...]
}
```

**Error (400/500)**
```json
{
  "status": "error",
  "error": "Error message",
  "stateTrace": [...]
}
```

**Authentication**

When `API_KEY` is set, requests must include:
```
Authorization: ApiKey <key>
```
or
```
Authorization: Bearer <token>
```

**Rate limiting**

Per-IP rate limits apply. 429 is returned when exceeded.

**Run timeout**

Single run-once requests can take up to 10 minutes for complex tasks. Set `RUN_ONCE_TIMEOUT_MS` (default `600000`) to override. The server enforces this limit; the TUI client uses the same value for its fetch timeout. On timeout, the server returns 504 with `{"status":"error","error":"Run timed out after Ns"}`.

**Heartbeat (autonomous runs)**

When `HEARTBEAT_ENABLED=true`, the server runs the agent periodically with a "Process heartbeat" goal. The observation includes the OpenClaw workspace (e.g. `HEARTBEAT.md`, `AGENTS.md`). Set `HEARTBEAT_INTERVAL_MS` (default `300000` = 5 min) to configure the interval. Overlapping runs are prevented. If `HEARTBEAT_REFIRE_ON_PENDING=true` (default), the server re-fires immediately when HEARTBEAT.md still has unchecked tasks, up to `HEARTBEAT_MAX_CONSECUTIVE_REFIRES` (default 5). See `docs/autonomous-execution-plan.md` for details.

### Observability UI (when OBS_UI_ENABLED)

When `OBS_UI_ENABLED=true` (default in dev), the server serves a local observability dashboard. Binds to localhost by default (`OBS_UI_BIND_LOCALHOST`; set to `false` to bind to `0.0.0.0`).

**Authentication**

When `API_KEY` is set, `/ui` routes require `Authorization: ApiKey <key>` or `Authorization: Bearer <token>` unless `OBS_UI_SKIP_AUTH=true` or `OBS_UI_SKIP_AUTH=1`. When skip-auth is set, the server is forced to bind to localhost (`127.0.0.1`), so the UI is only reachable locally.

**Clear endpoint**

`POST /ui/clear` clears runs and events buffers. Requires `OBS_UI_ALLOW_CLEAR=true` or `OBS_UI_ALLOW_CLEAR=1` in production; in non-production (`NODE_ENV !== 'production'`), clear is allowed without the env var.

| Endpoint | Method | Description |
|----------|--------|--------------|
| `/ui` | GET | Serves the React dashboard (SPA) |
| `/ui/runs` | GET | List of recent run completions (ring buffer, default 100) |
| `/ui/events` | GET | Server-Sent Events stream of audit events |
| `/ui/clear` | POST | Clear runs and events. Requires `OBS_UI_ALLOW_CLEAR=true` or non-production. |
| `/ui/docs` | GET | List of markdown docs. Returns `[{ id, title }]` only (no path). |
| `/ui/docs/:id` | GET | Markdown content for doc by id |

**OBS_UI_MD_ROOTS**: Comma-separated file/directory paths for markdown. Default: `README.md,docs/`. Supports `~/` expansion for paths outside the repo. Roots can be under the repo or external; path traversal is blocked—only files under configured roots are readable. Only `.md` files are served.

### Email and Scheduling (tools)

When the agent uses `send_email` or `schedule_task`:

**send_email** – Uses env vars or `data/email-config.json` (see below).

Env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`.

**create_test_email_account** – Creates Ethereal test account and saves config. For testing only.

**save_email_config** – Saves SMTP credentials to `EMAIL_CONFIG_PATH` (default: `data/email-config.json`). Agent can persist credentials when user provides them. Never writes to `.env`.

**schedule_task** – Stores tasks to a file for a scheduler to consume:

- `SCHEDULED_TASKS_PATH` – Path to JSON file (default: `data/scheduled-tasks.json`)

Tasks are persisted but not executed until a scheduler reads the file and triggers runs. See [tools/README.md](../tools/README.md) for tool usage.

### File Workspace Tools (tools)

The agent can use `read_file`, `list_dir`, `run_command`, `write_file`, and `create_workspace` under a resolved file workspace root.

- Safe root: `FILE_WORKSPACE_ROOT` (fallback `CODEX_CWD`, then `process.cwd()`).
- Risky mode (opt-in): `RISKY_WORKSPACE_MODE=true` or `FILE_WORKSPACE_MODE=risky`.
- Optional risky root override: `RISKY_WORKSPACE_ROOT=/path/to/repos` (default: parent of safe root).
