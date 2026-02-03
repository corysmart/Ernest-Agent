# Security Model

Security is enforced at multiple layers to treat all model outputs and local models as untrusted.

- Prompt injection filtering sanitizes external observations before prompt construction.
- Output validation enforces a strict JSON schema before any action executes.
- Tool permission gating enforces explicit allowlists.
- Sandboxed tool runners execute only registered handlers; no shell execution is permitted.
- Memory poisoning guard blocks injected or anomalous memory content.
- Rate limiting protects the API surface and downstream services.
- SSRF and path traversal protections block unsafe network and file access.
- Secrets access is routed through a vault abstraction.

# Threat Model

- Prompt injection and instruction override attempts.
- Model output manipulation to trigger unauthorized tools.
- Memory poisoning to bias future decisions.
- SSRF to access internal services.
- Path traversal for filesystem exfiltration.
- Prototype pollution via malicious payloads.
- Excessive request flooding or resource exhaustion.

Mitigations are validated in unit tests under `tests/security`.
