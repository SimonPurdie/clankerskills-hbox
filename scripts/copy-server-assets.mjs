import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist/server', { recursive: true });
await copyFile('src/server/wsl-sync.sh', 'dist/server/wsl-sync.sh');

