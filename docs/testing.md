# Testing

## Running Tests

```bash
npm install
npm test
npm run test:coverage
npm run lint
```

- **npm test**: Runs Jest in band (single-threaded) for unit, integration, and e2e tests.
- **npm run test:coverage**: Same as `npm test` with coverage report. Enforces thresholds.
- **npm run test:e2e**: Runs only e2e tests (real HTTP, mock LLM).
- **npm run lint**: ESLint across TypeScript files.

## Test Categories

| Category | Location | Purpose |
|----------|----------|---------|
| Unit | `tests/<module>/` | Isolated component behavior; mocked dependencies |
| Integration | `tests/integration/` | Cross-module flows (planning loop, memory retrieval, world simulation) |
| Security | `tests/security/` | Prompt injection, SSRF, path traversal, output validation, sandbox, rate limiting |
| E2E | `tests/e2e/` | Real HTTP against live server; mock LLM; CI-safe, no external services |

Tests are offline-safe where possible. DNS-dependent tests use mocks or explicit stubs to avoid network calls in CI.

## Coverage Expectations

Coverage thresholds (configured in `jest.config.cjs`):

- Branches: 90%
- Functions: 90%
- Lines: 90%
- Statements: 90%

New modules and tools are expected to include tests. Coverage gaps should be justified (e.g., platform-specific or integration-only code) and documented.

## CI Notes

- Tests run without external services by default. PostgreSQL-backed tests use `pg-mem` for in-process storage.
- DNS validation tests mock resolution to avoid real DNS lookups.
- CLI tool tests mock or skip execution when the CLI binary is not installed.

## Adding Tests for New Modules or Tools

1. **Unit tests**: Create `tests/<module>/<name>.test.ts`. Mock external dependencies (LLM adapter, DB, etc.). Use Jest `describe`/`it` and assert on observable behavior.
2. **Integration tests**: Add to `tests/integration/` when testing flows across modules. Use real (or pg-mem) storage where appropriate.
3. **Security tests**: Add to `tests/security/` for validation, sandboxing, path traversal, and injection. Use adversarial inputs.
4. **Tool tests**: For new tools, create `tests/tools/<tool-name>.test.ts`. Mock spawn/child processes when the tool depends on external binaries. Test path validation, abort handling, and error cases.

Example tool test pattern:

```typescript
// Mock the child_process spawn to avoid running real CLI
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({ on: jest.fn(), stdout: { on: jest.fn() }, stderr: { on: jest.fn() } }))
}));
```

Mock all imports for unit tests to keep them fast and deterministic.

## E2E Tests

`tests/e2e/` contains CI-safe end-to-end tests. They start a real HTTP server on an ephemeral port, issue real `fetch` requests, and use the mock LLM adapter. No external services (API keys, database, CLI tools) are required.

- **Run with**: `npm test` (included) or `npm run test:e2e` (e2e only)
- **Current scope**: Single durable test that validates the full stack (HTTP -> Fastify -> container -> agent -> response). Update only if the core API or architecture changes.
