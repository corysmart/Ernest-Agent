# Threat Model

## Assets

| Asset | Description |
|-------|-------------|
| Memory data | Episodic, semantic, procedural memories; user and agent context |
| Secrets | API keys, credentials supplied via environment |
| Tool access | Ability to execute tools (e.g., invoke_codex, invoke_claude) |
| Audit logs | Decisions, LLM requests, errors; may include sensitive metadata |

## Adversaries

| Adversary | Capability |
|-----------|-------------|
| Malicious prompts | User or upstream system supplies adversarial text to influence agent behavior |
| Compromised tools | Tool implementation or CLI binary is malicious or buggy |
| Insider misuse | Authorized user configures agent to exfiltrate or misuse data |
| Supply chain | Compromised dependency or CLI package |

## Attack Surfaces

- **LLM output**: Malformed or malicious response to trigger unauthorized actions
- **Tool execution**: Tools that read/write files, spawn processes, or make network calls
- **CLI adapters**: Codex/Claude Code binaries; temp files; child processes
- **Memory poisoning**: Injected content that biases future retrieval and decisions
- **SSRF**: Outbound requests to internal or unexpected endpoints via LLM-chosen URLs
- **Path traversal**: File access outside workspace via crafted paths
- **Observability UI**: Unauthenticated local exposure; docs viewer path risks; SSE data leakage

## Threats and Mitigations

| Threat | Mitigation |
|-------|-------------|
| **Prompt injection** | Prompt injection filter; sanitization of observations, goals, memory before prompt construction; execution blocked when flagged |
| **Tool misuse** | Permission gate with explicit allowlist; sandboxed execution in worker threads; timeouts and abort; no shell execution |
| **Memory poisoning** | Memory poisoning guard; anomaly detection on ingested content; sanitization of memory before prompt use |
| **SSRF** | DNS resolution validation; IP allowlist for API adapters; local LLM allowlist; no user-controlled URLs to outbound calls |
| **Path traversal** | `assertSafePath` against workspace root; validation of cwd, prompt files; symlink handling |
| **Denial of service** | Rate limiting; per-tenant budgets; circuit breaker; kill switch; request timeouts |
| **Data exfiltration via tools** | Tool allowlist restricts available tools; sandbox limits process and network access; audit logging for tool calls |
| **CLI process leakage** | Abort signal to tools; SIGTERM then SIGKILL; process group termination (Unix); temp files `0o600`; delayed worker terminate to allow grace period |
| **Observability UI unauthenticated access** | Auth required when `API_KEY` set unless `OBS_UI_SKIP_AUTH=true` (forces localhost bind); server binds to localhost when skip-auth used |
| **Docs viewer path traversal** | Root allowlist (`OBS_UI_MD_ROOTS`); paths outside baseDir allowed only if under configured roots; traversal blocked for other paths |
| **Docs viewer XSS** | Markdown sanitized (DOMPurify) before rendering |
| **SSE data leakage** | SSE stream emits audit events; intended for local/dev use; bind to localhost by default |
| **Accidental clear** | `POST /ui/clear` requires `OBS_UI_ALLOW_CLEAR=true` in production |

## Residual Risks

- **Schema-compliant bad decisions**: The model can produce valid JSON that encodes harmful actions. Mitigation depends on tool allowlists, goal constraints, and operational monitoring. No technical control fully eliminates this.
- **CLI binary trust**: CLI adapters trust the locally installed binary. Compromised CLI or supply chain can subvert this. Use API adapters for stricter isolation when possible.
- **Host compromise**: If the host is compromised, the agent process and its secrets are at risk. Defense in depth and host hardening are required beyond the framework.
- **Model extraction or memorization**: Long-running agents may surface training data or proprietary context through tool outputs. Operational controls (log redaction, output filtering) apply.
- **Non-cooperative providers**: If a tool subprocess ignores SIGTERM and SIGKILL, or spawns outside the process group, child processes may linger. Process group kill and escalation cover typical Unix behavior; exotic setups may require OS-level isolation (containers, cgroups).
