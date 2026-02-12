/**
 * Lightweight server tests for observability UI routes.
 */

import { buildServer } from '../../server/server';

describe('Observability UI', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LLM_PROVIDER = 'mock';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('OBS_UI_ENABLED=false', () => {
    it('returns 404 for /ui', async () => {
      process.env.OBS_UI_ENABLED = 'false';

      const server = await buildServer({ logger: false });

      const res = await server.inject({ method: 'GET', url: '/ui' });
      expect(res.statusCode).toBe(404);

      await server.close();
    });

    it('returns 404 for /ui/runs', async () => {
      process.env.OBS_UI_ENABLED = 'false';

      const server = await buildServer({ logger: false });

      const res = await server.inject({ method: 'GET', url: '/ui/runs' });
      expect(res.statusCode).toBe(404);

      await server.close();
    });
  });

  describe('OBS_UI_ENABLED=true', () => {
    beforeEach(() => {
      process.env.OBS_UI_ENABLED = 'true';
    });

    it('GET /ui/docs returns list of markdown docs', async () => {
      const server = await buildServer({ logger: false });

      const res = await server.inject({ method: 'GET', url: '/ui/docs' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
      expect(body.every((d: { id: string; title: string }) =>
        typeof d.id === 'string' && typeof d.title === 'string'
      )).toBe(true);

      await server.close();
    });

    it('GET /ui/docs/:id rejects path traversal', async () => {
      const server = await buildServer({ logger: false });

      const res = await server.inject({ method: 'GET', url: '/ui/docs/../../../etc/passwd' });
      expect([400, 404]).toContain(res.statusCode);

      await server.close();
    });

    it('GET /ui/docs/:id rejects non-md id with invalid chars', async () => {
      const server = await buildServer({ logger: false });

      const res = await server.inject({ method: 'GET', url: '/ui/docs/..%2F..%2Fetc%2Fpasswd' });
      expect([400, 404]).toContain(res.statusCode);

      await server.close();
    });

    it('allows /ui routes without auth when OBS_UI_SKIP_AUTH and API_KEY set', async () => {
      process.env.OBS_UI_ENABLED = 'true';
      process.env.OBS_UI_SKIP_AUTH = 'true';
      process.env.API_KEY = 'secret';

      const server = await buildServer({ logger: false });

      const res = await server.inject({ method: 'GET', url: '/ui/runs' });
      expect(res.statusCode).toBe(200);

      await server.close();
    });

    it('requires auth for /ui when API_KEY set and OBS_UI_SKIP_AUTH not set', async () => {
      process.env.OBS_UI_ENABLED = 'true';
      process.env.API_KEY = 'secret';
      delete process.env.OBS_UI_SKIP_AUTH;

      const server = await buildServer({ logger: false });

      const res = await server.inject({ method: 'GET', url: '/ui/runs' });
      expect(res.statusCode).toBe(401);

      await server.close();
    });

    it('POST /ui/clear returns 403 when OBS_UI_ALLOW_CLEAR not set in production', async () => {
      process.env.OBS_UI_ENABLED = 'true';
      process.env.NODE_ENV = 'production';
      delete process.env.OBS_UI_ALLOW_CLEAR;

      const server = await buildServer({ logger: false });

      const res = await server.inject({ method: 'POST', url: '/ui/clear' });
      expect(res.statusCode).toBe(403);

      await server.close();
    });

    it('POST /ui/clear succeeds when OBS_UI_ALLOW_CLEAR=true', async () => {
      process.env.OBS_UI_ENABLED = 'true';
      process.env.OBS_UI_ALLOW_CLEAR = 'true';
      process.env.NODE_ENV = 'production';

      const server = await buildServer({ logger: false });

      const res = await server.inject({ method: 'POST', url: '/ui/clear' });
      expect(res.statusCode).toBe(200);

      await server.close();
    });

    it('GET /ui/docs/:id returns content for valid doc', async () => {
      const server = await buildServer({ logger: false });

      const docsRes = await server.inject({ method: 'GET', url: '/ui/docs' });
      const docs = JSON.parse(docsRes.payload);
      const readme = docs.find((d: { id: string }) => d.id === 'README' || d.id.includes('README'));
      if (!readme) {
        await server.close();
        return;
      }

      const res = await server.inject({ method: 'GET', url: `/ui/docs/${encodeURIComponent(readme.id)}` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('content');

      await server.close();
    });
  });
});
