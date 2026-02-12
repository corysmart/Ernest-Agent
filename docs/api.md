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

- `with-llm`: Calls LLM (Codex, OpenAI, etc.), validates output, returns decision. Skips act, memory, self-model updates. Useful to see what the model would decide without running tools.
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
