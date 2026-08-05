import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { createApp } from './app';
import { createPlatformServices } from './platform';
import { AppService } from './service';
import { SyncEngine } from './sync-engine';

const port = 43127;
const projectRoot = process.cwd();
const csrfToken = randomBytes(32).toString('base64url');
const platform = createPlatformServices();
const syncEngine = new SyncEngine({ platform, projectRoot });
const service = new AppService(platform, syncEngine, csrfToken);
await service.initialize();

let shuttingDown = false;
let app: Awaited<ReturnType<typeof createApp>>;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  while (service.isSyncing()) await new Promise((resolve) => setTimeout(resolve, 100));
  await app.close();
  process.exitCode = 0;
};

app = await createApp({ service, projectRoot, csrfToken, port, onShutdown: () => void shutdown() });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.on(signal, () => void shutdown());

try {
  await app.listen({ host: '127.0.0.1', port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

