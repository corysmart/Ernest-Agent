# Architecture Overview

The Cognitive Agent Wrapper separates cognition from model inference, storage, and execution. The LLM is a replaceable component behind a strict adapter interface.

```mermaid
flowchart LR
  Server["server (Fastify)"] --> Agent["core: CognitiveAgent"]
  Agent --> Memory["memory: manager + repos + vector store"]
  Agent --> World["world: state + predictors"]
  Agent --> Self["self: capability + reliability model"]
  Agent --> Goals["goals: goal stack + planner"]
  Agent --> Env["env: environment interface"]
  Agent --> Security["security: validation + gating"]
  Agent --> LLM["llm: adapters (OpenAI / Anthropic / Local)"]
  Agents["agents: registry + message bus"] --> Agent
  Memory --> Vector["vector: local / faiss adapter"]
  Memory --> Postgres["memory repo (Postgres or in-memory)"]
```

The control loop follows a state machine: observe, retrieve memory, update world, update self, plan, simulate, query LLM, validate, act, store results, learn.
