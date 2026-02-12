# CLI Tools (invoke_codex, invoke_claude)

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

**invoke_codex** – `actionPayload: { prompt: "Your instruction" }`

| Input   | Type   | Description                                         |
|---------|--------|-----------------------------------------------------|
| prompt  | string | Instruction (required)                             |
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
