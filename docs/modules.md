# Module Responsibilities

- `core`: Cognition loop, dependency injection, shared contracts.
- `memory`: Episodic, semantic, procedural memory storage, retrieval, and scoring.
- `world`: World state representation, predictors, simulation, and uncertainty tracking.
- `self`: Capability tracking, tool access, reliability, and confidence updates.
- `goals`: Goal stack, hierarchy, priorities, planner with simulation-based selection.
- `agents`: Multi-agent registry, message protocol, role specialization, memory boundaries.
- `llm`: Model adapters implementing `LLMAdapter` (OpenAI, Anthropic, Local, Mock).
- `env`: Environment interface and mocks for observation/action.
- `security`: Prompt injection filtering, output validation, permission gating, rate limits, vaults, SSRF and path protections.
- `server`: Fastify API wiring and request orchestration.
- `tests`: Unit and integration tests mirroring each module.
