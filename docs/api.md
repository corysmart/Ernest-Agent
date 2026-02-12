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
