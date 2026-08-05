import Fastify, { type FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppService } from './service';

interface AppOptions {
  service: AppService;
  projectRoot: string;
  csrfToken: string;
  port: number;
  onShutdown: () => void;
}

export async function createApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const expectedOrigins = new Set([
    `http://127.0.0.1:${options.port}`,
    `http://localhost:${options.port}`,
    'http://127.0.0.1:5173',
  ]);

  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host;
    if (host && host !== `127.0.0.1:${options.port}` && host !== `localhost:${options.port}` && host !== '127.0.0.1:5173') {
      return reply.code(403).send({ error: 'Invalid host.' });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.url.startsWith('/api/')) {
      const origin = request.headers.origin;
      const csrf = request.headers['x-clankerskills-csrf'];
      if (!origin || !expectedOrigins.has(origin) || csrf !== options.csrfToken) {
        return reply.code(403).send({ error: 'Request verification failed.' });
      }
      if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
        return reply.code(415).send({ error: 'JSON content is required.' });
      }
    }
  });

  app.get('/health', async () => ({ application: 'clankerskills', ready: true }));
  app.get('/api/state', async () => options.service.getState());
  app.post<{ Body: { selectedEntryIds?: unknown } }>('/api/sync', async (request, reply) => {
    if (!Array.isArray(request.body?.selectedEntryIds) || !request.body.selectedEntryIds.every((id) => typeof id === 'string')) {
      return reply.code(400).send({ error: 'selectedEntryIds must be an array of strings.' });
    }
    try {
      return await options.service.sync(request.body.selectedEntryIds as string[]);
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode ?? 500);
      return reply.code(statusCode).send({ error: (error as Error).message });
    }
  });
  app.post<{ Body: { target?: unknown } }>('/api/open-folder', async (request, reply) => {
    if (!['repository', 'windows', 'wsl'].includes(String(request.body?.target))) {
      return reply.code(400).send({ error: 'Unknown folder target.' });
    }
    try {
      await options.service.openFolder(request.body.target as 'repository' | 'windows' | 'wsl');
      return { ok: true };
    } catch (error) {
      return reply.code(500).send({ error: (error as Error).message });
    }
  });
  app.post('/api/recover', async (_request, reply) => {
    try {
      return { warnings: await options.service.retryRecovery() };
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode ?? 500);
      return reply.code(statusCode).send({ error: (error as Error).message });
    }
  });
  app.post('/api/shutdown', async (_request, reply) => {
    if (options.service.isSyncing()) return reply.code(409).send({ error: 'Close is blocked while syncing.' });
    await reply.code(202).send({ accepted: true });
    setTimeout(options.onShutdown, 25);
  });

  const clientRoot = path.resolve(options.projectRoot, 'dist', 'client');
  const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  app.get('/*', async (request, reply) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      return reply.code(400).send('Invalid URL.');
    }
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidate = path.resolve(clientRoot, requested);
    if (candidate !== clientRoot && !candidate.startsWith(`${clientRoot}${path.sep}`)) {
      return reply.code(403).send('Forbidden.');
    }
    try {
      const body = await readFile(candidate);
      return reply.type(contentTypes[path.extname(candidate).toLowerCase()] ?? 'application/octet-stream').send(body);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.extname(requested)) {
        return reply.code(404).send('Not found.');
      }
      return reply.type('text/html; charset=utf-8').send(await readFile(path.join(clientRoot, 'index.html')));
    }
  });
  return app;
}
