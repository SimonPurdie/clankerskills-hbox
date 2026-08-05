import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeSelectorConfig } from '../src/server/config';
import type { PlatformServices, WslTarget } from '../src/server/platform';
import { AppService } from '../src/server/service';
import type { SyncEngine } from '../src/server/sync-engine';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('AppService state', () => {
  it('imports standalone skills but never infers pack selection, and detects WSL target drift', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clankerskills-service-'));
    temporaryDirectories.push(root);
    const repositoryPath = path.join(root, 'repo');
    const windowsTargetPath = path.join(root, 'windows-skills');
    await mkdir(path.join(repositoryPath, 'solo'), { recursive: true });
    await writeFile(path.join(repositoryPath, 'solo', 'SKILL.md'), '# solo');
    await mkdir(path.join(repositoryPath, 'bundle', 'packed'), { recursive: true });
    await writeFile(path.join(repositoryPath, 'bundle', 'packed', 'SKILL.md'), '# packed');
    await mkdir(path.join(windowsTargetPath, 'solo'), { recursive: true });
    await mkdir(path.join(windowsTargetPath, 'packed'), { recursive: true });

    const wsl: WslTarget = {
      distro: 'Ubuntu-New',
      home: '/home/test',
      linuxPath: '/home/test/.agents/skills',
      windowsPath: '\\\\wsl.localhost\\Ubuntu-New\\home\\test\\.agents\\skills',
    };
    const platform: PlatformServices = {
      windowsHome: root,
      repositoryPath,
      windowsTargetPath,
      detectWsl: vi.fn(async () => wsl),
      listWslDirectories: vi.fn(async () => ['packed']),
      convertWindowsPath: vi.fn(),
      runWsl: vi.fn(),
      openFolder: vi.fn(),
    };
    const syncEngine = { recover: vi.fn(async () => []) } as unknown as SyncEngine;
    const service = new AppService(platform, syncEngine, 'csrf');
    await service.initialize();

    const firstRun = await service.getState();
    expect(firstRun.initialSelection).toEqual(['skill:solo']);
    expect(firstRun.initialSelection).not.toContain('pack:bundle');
    expect(firstRun.targetDrift).toBe(false);

    await writeSelectorConfig(repositoryPath, {
      version: 1,
      selectedEntries: ['skill:solo'],
      resolvedSkills: [{ entryId: 'skill:solo', sourceRelativePath: 'solo', destinationName: 'solo' }],
      syncId: 'older-sync',
      wslDistro: 'Ubuntu-Old',
      wslHome: '/home/test',
    });
    expect((await service.getState()).targetDrift).toBe(true);
  });
});

