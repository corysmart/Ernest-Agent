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

**Option D: Claude Code CLI**
```bash
# Install: brew install claude-code  # or npm install -g @anthropic-ai/claude-code
# Run: claude auth login
# The agent uses invoke_claude when given goals that call it
```

See [tools/README.md](tools/README.md) for CLI setup. The server uses Codex when no API keys are set. CLI adapters use temp files (not argv) and are suitable for development; use API adapters for production with strict isolation.

## 3. Start the Server

```bash
npm run dev
```

Server listens on port 3000 (or `PORT` if set). You should see: `Server listening on port 3000`.

**Observability UI**: In development, the dashboard is enabled by default. Visit `http://localhost:3000/ui` for Runs, Audit Events (SSE), and Docs. Set `OBS_UI_ENABLED=true` explicitly to enable in other environments. Run `npm run ui:build` first if the UI is not built.

## 4. Send Requests

### Terminal UI (recommended)

Interactive interface for all operations—no curl required:

```bash
npm run ernest-agent
```

Starts a menu-driven TUI. Connects to the server, prompts for user message and goal, and supports:
- Run agent (full execution)
- Dry run (with or without LLM)
- Health check

Set `AGENT_URL` for a different endpoint (default: `http://127.0.0.1:3000`).

### Script-based requests

**Health check**

Use the TUI (`npm run ernest-agent`) and select "Health check", or `curl -s http://localhost:3000/health`.

**Run agent (simple observation)**
```bash
npm run request:run
```
Sends a basic user message. The agent observes the state, plans, and may call tools.

**Run agent with a goal**
```bash
npm run request:run-goal
```
Sends observation plus a goal. The agent attempts to satisfy the goal.

**Dry run (no side effects)**
```bash
npm run request:run-dry-with-llm      # Calls LLM, shows decision, skips tools (uses autoRespond)
npm run request:run-dry-with-llm-goal # Same with explicit goal
npm run request:run-dry-without-llm    # Skips LLM, uses stub decision, no API cost
```

**Auto-respond**
By default, requests with a `user_message` but no explicit goal return idle. To have the server inject a default "Respond to user" goal, set `AUTO_RESPOND=true` (env) or include `"autoRespond": true` in the request body.

**Follow-up prompts (multi-turn)**

When the agent or Codex asks a clarifying question, pass the prior exchange in `observation.conversation_history`:

```json
{
  "observation": {
    "state": { "user_message": "main.ts" },
    "conversation_history": [
      { "role": "user", "content": "Help me refactor" },
      { "role": "assistant", "content": "Which file would you like me to refactor?" }
    ]
  },
  "goal": { "id": "g1", "title": "Respond to user" }
}
```

Use `node scripts/run-request.cjs requests/run-once-follow-up.json` or the ernest-agent TUI, which offers **Send follow-up** after each run.

## Customizing the Request

Edit the JSON payloads in `requests/`:

- `requests/run-once.json` – observation only
- `requests/run-once-goal.json` – observation and goal
- `requests/run-once-dry-with-llm.json` – dry run with LLM, autoRespond (no explicit goal)
- `requests/run-once-dry-with-llm-goal.json` – dry run with LLM and explicit goal
- `requests/run-once-dry-without-llm.json` – dry run without LLM (stub decision, no API cost)
- `requests/run-once-follow-up.json` – follow-up response with conversation history

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

## Using a specific branch (Codex)

Codex runs in the repo directory. To use a specific branch:

**Option 1: Checkout branch before starting**
```bash
git checkout dev
npm run dev
```

**Option 2: Use a separate clone**
```bash
# Clone or copy the repo to a dev-branch directory
git clone . ../ernest-agent-dev  # or your path
cd ../ernest-agent-dev && git checkout dev

# Run server from main, point Codex at dev clone
cd /path/to/ernest-agent
CODEX_CWD=../ernest-agent-dev npm run dev
```

`CODEX_CWD` supports `~` expansion (e.g. `CODEX_CWD=~/repos/ernest-dev`).

## Resetting dev to match main

To overwrite `dev` with the current state of `main`, commit or stash your changes first, then:

```bash
git fetch origin main   # if main is on remote
git checkout dev
git reset --hard origin/main   # or: git reset --hard main
git checkout main      # return to main
```

This discards all commits on `dev`. To preserve history, use `git merge main` instead.

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
