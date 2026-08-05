import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG_FILENAME, loadSelectorConfig, writeSelectorConfig } from '../src/server/config';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('selector config', () => {
  it('rejects the legacy artifact without migrating it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clankerskills-config-'));
    temporaryDirectories.push(root);
    await writeFile(path.join(root, CONFIG_FILENAME), JSON.stringify({ selectedSkills: ['old'] }));
    const result = await loadSelectorConfig(root);
    expect(result.config).toBeNull();
    expect(result.warning).toMatch(/unsupported version/i);

    const replacement = { version: 1 as const, selectedEntries: [], resolvedSkills: [], syncId: 'replacement', wslDistro: 'Ubuntu', wslHome: '/home/test' };
    await writeSelectorConfig(root, replacement);
    expect((await loadSelectorConfig(root)).config).toEqual(replacement);
  });

  it('atomically writes and reads version 1 state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clankerskills-config-'));
    temporaryDirectories.push(root);
    const config = { version: 1 as const, selectedEntries: ['pack:tools'], resolvedSkills: [], syncId: 'sync-1', wslDistro: 'Ubuntu', wslHome: '/home/test' };
    await writeSelectorConfig(root, config);
    expect((await loadSelectorConfig(root)).config).toEqual(config);
  });
});
