# Quick Start

Get the Ernest agent server running and make your first request in a few minutes.

## Prerequisites

- Node.js 18+
- npm (use `npm install`, not pnpm)

## 1. Install and Build

```bash
npm install
npm run build
```

## 2. Configure the LLM (required)

The agent needs an LLM to run. Set one of the following:

**Option A: OpenAI (API)**
```bash
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini
export OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

**Option B: Anthropic (API)**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ANTHROPIC_MODEL=claude-3-5-haiku-20241022
export ANTHROPIC_EMBEDDING_MODEL=...
```

**Option C: Codex CLI (no API key)**
```bash
# Install: npm install -g @openai/codex
# Run codex once to authenticate
# Leave OPENAI_API_KEY and ANTHROPIC_API_KEY unset
```

See [tools/README.md](tools/README.md) for CLI setup. The server uses Codex when no API keys are set.

## 3. Start the Server

```bash
npm run dev
```

Server listens on port 3000 (or `PORT` if set). You should see: `Server listening on port 3000`.

## 4. Send Requests

**Health check**
```bash
npm run curl:health
```
Expected: `{"status":"ok"}`

**Run agent (simple observation)**
```bash
npm run curl:run
```
Sends a basic user message. The agent observes the state, plans, and may call tools.

**Run agent with a goal**
```bash
npm run curl:run-goal
```
Sends observation plus a goal. The agent attempts to satisfy the goal.

**Dry run (no side effects)**
```bash
npm run curl:run-dry-with-llm     # Calls LLM, shows decision, skips tools
npm run curl:run-dry-without-llm  # Skips LLM, uses stub decision, no API cost
```
Add `"dryRun": "with-llm"` or `"dryRun": "without-llm"` to the request body.

## Customizing the Request

Edit the JSON payloads in `requests/`:

- `requests/run-once.json` – observation only
- `requests/run-once-goal.json` – observation and goal
- `requests/run-once-dry-with-llm.json` – dry run with LLM (decision only, no tools)
- `requests/run-once-dry-without-llm.json` – dry run without LLM (stub decision, no API cost)

Example observation state:
```json
{
  "observation": {
    "state": {
      "user_message": "Your message here"
    }
  }
}
```

Example with goal:
```json
{
  "observation": { "state": { "user_message": "..." } },
  "goal": {
    "id": "g1",
    "title": "My goal",
    "description": "Optional details"
  }
}
```

Example with dry run:
```json
{
  "observation": { "state": { "user_message": "..." } },
  "dryRun": "with-llm"
}
```
Use `"dryRun": "with-llm"` to call the LLM and return the decision without executing tools. Use `"dryRun": "without-llm"` to skip the LLM and return a stub decision (no API cost).

## Different Port

To run on another port:
```bash
PORT=4000 npm run dev
```

The curl scripts use port 3000. For port 4000, run curl manually:
```bash
curl -s http://localhost:4000/health
curl -s -X POST http://localhost:4000/agent/run-once \
  -H "Content-Type: application/json" \
  -d @requests/run-once.json
```

## API Key Authentication

When `API_KEY` is set, all requests must include an `Authorization` header:
```bash
curl -s -X POST http://localhost:3000/agent/run-once \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey $API_KEY" \
  -d @requests/run-once.json
```

## Next Steps

- [docs/api.md](docs/api.md) – Full API reference (run-once, dryRun, auth)
- [docs/architecture.md](docs/architecture.md) – How the agent loop works
- [docs/security.md](docs/security.md) – Security model and controls
- [tools/README.md](tools/README.md) – invoke_codex and invoke_claude setup
