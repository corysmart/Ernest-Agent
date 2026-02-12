/**
 * Observability UI routes. Registered only when OBS_UI_ENABLED.
 */

import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import { assertSafePath } from '../security/path-traversal';
import type { ObservabilityStore } from './observability-store';
import { listDocs, getDocContent, invalidateDocsCache } from './docs-resolver';

const isUiEnabled = (): boolean => {
  const env = process.env.OBS_UI_ENABLED;
  if (env === undefined) {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev';
  }
  return env === 'true' || env === '1';
};

export async function registerObservabilityRoutes(
  fastify: FastifyInstance,
  obsStore: ObservabilityStore
): Promise<void> {
  if (!isUiEnabled()) return;

  const baseDir = process.cwd();

  fastify.addHook('preHandler', (request, reply, done) => {
    if (!request.url.startsWith('/ui')) {
      done();
      return;
    }
    if (!process.env.API_KEY) {
      done();
      return;
    }
    if (process.env.OBS_UI_SKIP_AUTH === 'true' || process.env.OBS_UI_SKIP_AUTH === '1') {
      done();
      return;
    }
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2) {
      reply.code(401).send({ error: 'Invalid authorization' });
      return;
    }
    const [scheme, token] = parts;
    if ((scheme === 'ApiKey' || scheme === 'Bearer') && token === process.env.API_KEY) {
      done();
    } else {
      reply.code(401).send({ error: 'Invalid token' });
    }
  });

  const distDir = join(__dirname, '..', '..', 'ui', 'dist');

  fastify.get('/ui', async (_request, reply) => {
    const uiPath = join(distDir, 'index.html');
    try {
      const html = readFileSync(uiPath, 'utf-8');
      reply.type('text/html').send(html);
    } catch {
      reply.code(404).send({ error: 'UI not built. Run npm run ui:build' });
    }
  });

  fastify.get('/ui/*', async (request, reply) => {
    const p = (request.params as { '*': string })['*'] || '';
    if (p === '' || p === 'index.html') {
      try {
        const html = readFileSync(join(distDir, 'index.html'), 'utf-8');
        reply.type('text/html').send(html);
      } catch {
        reply.code(404).send({ error: 'UI not built' });
      }
      return;
    }
    assertSafePath(distDir, p);
    const filePath = join(distDir, p);
    try {
      const content = readFileSync(filePath);
      const ext = p.split('.').pop() || '';
      const mime: Record<string, string> = {
        js: 'application/javascript',
        css: 'text/css',
        html: 'text/html',
        json: 'application/json',
        ico: 'image/x-icon',
        svg: 'image/svg+xml'
      };
      reply.type(mime[ext] || 'application/octet-stream').send(content);
    } catch {
      try {
        const html = readFileSync(join(distDir, 'index.html'), 'utf-8');
        reply.type('text/html').send(html);
      } catch {
        reply.code(404).send({ error: 'Not found' });
      }
    }
  });

  fastify.get('/ui/runs', async () => obsStore.getRuns());

  fastify.get('/ui/active-runs', async () => obsStore.getActiveRuns());

  fastify.get('/ui/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    const send = (event: { timestamp: number; tenantId?: string; requestId?: string; eventType: string; data: Record<string, unknown> }) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    obsStore.getEvents().forEach(send);
    const unsub = obsStore.subscribe(send);
    request.raw.on('close', unsub);
  });

  fastify.post('/ui/clear', async (_request, reply) => {
    const allowClear = process.env.OBS_UI_ALLOW_CLEAR === 'true' || process.env.OBS_UI_ALLOW_CLEAR === '1'
      || (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'prod');
    if (!allowClear) {
      reply.code(403).send({ error: 'Clear not allowed. Set OBS_UI_ALLOW_CLEAR=true or NODE_ENV !== production.' });
      return;
    }
    obsStore.clear();
    invalidateDocsCache();
    return { ok: true };
  });

  fastify.get('/ui/docs', async () => listDocs(baseDir));

  fastify.get<{ Params: { id: string } }>('/ui/docs/:id', async (request, reply) => {
    const { id } = request.params;
    if (!/^[a-zA-Z0-9_\-.]+$/.test(id)) {
      reply.code(400).send({ error: 'Invalid id' });
      return;
    }
    try {
      const content = getDocContent(baseDir, id);
      return { id, content };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('traversal') || msg.includes('Invalid')) {
        reply.code(400).send({ error: msg });
      } else if (msg.includes('not found')) {
        reply.code(404).send({ error: msg });
      } else {
        reply.code(500).send({ error: msg });
      }
    }
  });
}
