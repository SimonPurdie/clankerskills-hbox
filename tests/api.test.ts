import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/app';
import type { AppService } from '../src/server/service';

const apps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('local API security', () => {
  it('requires the expected origin and CSRF token for mutations', async () => {
    await mkdir(path.join(process.cwd(), 'dist', 'client'), { recursive: true });
    await writeFile(path.join(process.cwd(), 'dist', 'client', 'index.html'), '<html></html>');
    const service = {
      isSyncing: () => false,
      sync: vi.fn(),
      getState: vi.fn(),
      openFolder: vi.fn(),
    } as unknown as AppService;
    const app = await createApp({ service, projectRoot: process.cwd(), csrfToken: 'secret', port: 43127, onShutdown: vi.fn() });
    apps.push(app);

    const rejected = await app.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { host: '127.0.0.1:43127', origin: 'https://example.com', 'content-type': 'application/json' },
      payload: { selectedEntryIds: [] },
    });
    expect(rejected.statusCode).toBe(403);

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/sync',
      headers: {
        host: '127.0.0.1:43127',
        origin: 'http://127.0.0.1:43127',
        'content-type': 'application/json',
        'x-clankerskills-csrf': 'secret',
      },
      payload: { selectedEntryIds: [] },
    });
    expect(accepted.statusCode).toBe(200);
    expect(service.sync).toHaveBeenCalledWith([]);

    const traversal = await app.inject({
      method: 'GET',
      url: '/%2e%2e/package.json',
      headers: { host: '127.0.0.1:43127' },
    });
    expect(traversal.statusCode).toBe(404);
    expect(traversal.body).not.toContain('clankerskills');
  });
});
