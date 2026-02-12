# Security

## Security Philosophy

The framework treats all LLMs as untrusted. Local models, remote APIs, and CLI-based tools are subject to the same validation and sandboxing. Prompt injection, tool misuse, and output manipulation are expected; the system defends against them by design.

Principles:

- **Untrusted LLMs**: Model output is never trusted. Schema validation runs before any action executes.
- **Least privilege**: Tools run in worker threads with timeouts, explicit allowlists, and no shell execution.
- **Defense in depth**: Multiple controls (prompt filtering, output validation, permission gating, sandbox) so a single failure does not bypass safety.

## Trust Boundaries

| Boundary | Trust level | Notes |
|----------|-------------|-------|
| LLM | Untrusted | Output validated; no direct system access |
| Tools | Untrusted | Sandboxed; allowlist; timeout and abort |
| Environment | Trusted | Supplied by host; observation and action interface |
| Database | Trusted | Memory and audit logs; host-managed |
| User inputs | Untrusted | Sanitized before use; prompt injection filtered |

## Key Controls

### Prompt Injection Filtering

External observations and user-supplied content are sanitized before prompt construction. Flagged content blocks execution. Goal titles, descriptions, and memory context are also sanitized before inclusion in prompts.

### Output Validation

LLM responses must match a strict JSON schema. Malformed or unexpected output is rejected before any action is executed. No partial trust of model output.

### Path Traversal and SSRF

- File paths (cwd, prompt files) are validated against a workspace root. Symlinks and parent traversal are blocked.
- Outbound requests use DNS validation and IP allowlists. Private ranges and localhost are restricted for API adapters. Local LLMs use an explicit allowlist.

### Sandboxed Tool Execution

Tools run in worker threads. Handlers are looked up by name from a static registry; no `eval` or dynamic code execution. Timeouts trigger abort; tools receive `AbortSignal` and escalate to SIGTERM then SIGKILL. Process groups (Unix) are used so forked children are terminated.

### Rate Limiting

Per-tenant budgets (max runs/hour, max tokens/day) and API-level rate limits reduce abuse and resource exhaustion.

### Audit Logging

Structured logs for LLM requests, agent decisions, tool calls, and errors. Supports compliance and incident response.

### Secrets Isolation

Secrets (API keys, etc.) are supplied via environment variables. A vault abstraction routes access for future key management integration.

## CLI Adapter Caveats

CLI-based adapters (Codex, Claude Code) run locally installed tools. They introduce additional risk compared to API adapters:

- **Risks**: The CLI binary is trusted by the host. A compromised or malicious CLI could exfiltrate data or persist state. Temp files and child processes can leak if not cleaned up.
- **Mitigations**:
  - Prompts are not passed in process argv; they go through temp files or stdin to avoid prompt leakage in process listings.
  - Temp files use mode `0o600` so only the owner can read.
  - Abort signal plus SIGTERM/SIGKILL escalation ensures CLI processes are terminated on timeout.
  - Process group termination (Unix) kills forked children when the parent is killed.
  - Path validation for `cwd` and prompt file paths.

CLI adapters are suitable for development and subscription-based usage. For production with strict isolation, prefer API adapters behind a controlled service boundary.

### Observability UI

When `OBS_UI_ENABLED`, `/ui` routes are protected by the same auth as the API. If `API_KEY` is set, `/ui` requires authentication unless `OBS_UI_SKIP_AUTH=true` (which forces the server to bind to localhost). `POST /ui/clear` requires `OBS_UI_ALLOW_CLEAR=true` in production to prevent accidental data loss. Markdown content in the Docs viewer is sanitized (DOMPurify) before rendering.

## Operational Guidance

1. **Worker isolation**: Run the agent in a process or container with restricted permissions. Limit filesystem and network access.
2. **Log redaction**: Redact or mask sensitive fields (tokens, user data) before shipping logs to external systems.
3. **Restricted tool allowlist**: Enable only the tools required for the use case. Avoid broad tool grants.
4. **Environment hardening**: Use dedicated API keys with minimal scopes. Rotate credentials regularly.
5. **Audit review**: Regularly review audit logs for anomalous decisions or tool usage.

## Known Limits

- **Non-cooperative providers**: If a provider ignores SIGTERM and SIGKILL, or spawns processes outside the group, child processes may linger. Process group kill covers typical Unix behavior; exotic setups may require OS-level isolation (containers, cgroups).
- **Local tool risks**: CLI adapters trust the locally installed binary. Supply chain and host compromise remain concerns.
- **Model behavior**: Validation catches malformed output but cannot prevent a model from making bad-but-valid decisions within the schema. Domain-specific policy (e.g., tool allowlists, goal constraints) must be configured by the operator.
