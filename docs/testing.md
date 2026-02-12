# Testing

## Running Tests

```bash
npm install
npm test
npm run test:debug
npm run test:coverage
npm run test:e2e
npm run lint
npm run build
npm run dev:test
```

- Runtime: Node.js `>=18` (`package.json` `engines.node`).
- **npm test**: `jest --runInBand` (single process), runs all `tests/**/*.test.ts`.
- **npm run test:debug**: Same as `npm test`, but disables Jest silent mode for easier debugging.
- **npm run test:coverage**: `jest --coverage`, runs full suite with coverage output and threshold checks.
- **npm run test:e2e**: `jest --runInBand --testPathPattern=tests/e2e`, runs only e2e tests.
- **npm run lint**: `eslint . --ext .ts` (static checks, not Jest).
- **npm run dev:test**: Starts compiled server in mock mode and runs a sample request (`start-server-and-test` on `/health` + `request:run-goal`).
- **npm run build**: Compiles TypeScript to `dist/`; run before `dev:test` when `dist/` is stale.

Jest configuration (`jest.config.cjs`) uses:

- `preset: ts-jest`
- `testEnvironment: node`
- `testMatch: **/tests/**/*.test.ts`
- `testTimeout: 30000`
- `silent: true` by default

## Test Suite Layout

| Suite | Location | Purpose |
|------|----------|---------|
| Component/module tests | `tests/agents/`, `tests/cli/`, `tests/core/`, `tests/env/`, `tests/goals/`, `tests/llm/`, `tests/memory/`, `tests/runtime/`, `tests/self/`, `tests/server/`, `tests/tools/`, `tests/world/` | Behavior of individual modules, usually with mocked boundaries |
| Integration | `tests/integration/` | Cross-module flows (planning loop, memory retrieval, world simulation, model swapping, audit flow) |
| Security | `tests/security/` | Prompt injection, SSRF, path traversal, sandboxing, tenant isolation, validation, rate limiting |
| End-to-end | `tests/e2e/` | Real HTTP against live Fastify server with mock LLM |

`tests/fixtures/` holds fixture files for tests (for example, CLI prompt-file cases).

## Coverage Expectations

Coverage thresholds are configured in `jest.config.cjs` and enforced on coverage runs:

- Branches: 90%
- Functions: 90%
- Lines: 90%
- Statements: 90%

Coverage collection targets these code areas:

- `cli/`, `core/`, `memory/`, `world/`, `self/`, `goals/`, `agents/`, `llm/`, `env/`, `runtime/`, `server/`, `security/`

Some files are intentionally excluded via `coveragePathIgnorePatterns` (entrypoints, selected adapters, tooling workers, and other non-target files).

## CI Notes

- Tests run without external services by default. PostgreSQL-backed tests use `pg-mem` for in-process storage.
- DNS-related tests use mocks/stubs so CI does not require live DNS/network dependencies.
- CLI tool tests mock `child_process.spawn` for `codex`/`claude`, so binaries do not need to be installed in CI.
- E2E tests set `LLM_PROVIDER=mock`, set `MOCK_LLM_RESPONSE` explicitly, and listen on an ephemeral localhost port.

## Adding Tests for New Modules or Tools

1. **Module tests**: Add to the matching `tests/<module>/` directory. Mock external boundaries (LLM APIs, DB/network, process execution).
2. **Integration tests**: Add to `tests/integration/` for multi-module flows and end-to-end behavior inside the process.
3. **Security tests**: Add to `tests/security/` for adversarial/pathological inputs.
4. **Tool tests**: Add to `tests/tools/` and mock process execution for external CLIs.

Example tool test pattern:

```typescript
import { spawn } from 'child_process';
jest.mock('child_process');
const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

mockedSpawn.mockReturnValue({
  stdout: { on: jest.fn() },
  stderr: { on: jest.fn() },
  on: jest.fn()
} as never);
```

Prefer deterministic tests with explicit mocks and stable fixtures.

## E2E Tests

`tests/e2e/` is CI-safe: tests start a real server on an ephemeral localhost port, send real `fetch` requests, and run with mock LLM responses. No external API keys, DB services, or CLI binaries are required.

- **Run with**: `npm test` (included) or `npm run test:e2e` (e2e only)
- **Current scope**: Single durable test that validates the full stack (HTTP -> Fastify -> container -> agent -> response). Update only if the core API or architecture changes.
