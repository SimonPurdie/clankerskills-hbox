import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WindowsTargetDriver } from '../src/server/targets';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('WindowsTargetDriver', () => {
  it('flattens staged sources and can restore the previous target', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clankerskills-target-'));
    temporaryDirectories.push(root);
    const repository = path.join(root, 'repo');
    const target = path.join(root, '.agents', 'skills');
    await mkdir(path.join(repository, 'Pack', 'nested'), { recursive: true });
    await writeFile(path.join(repository, 'Pack', 'nested', 'SKILL.md'), '# packed');
    await mkdir(path.join(target, 'old'), { recursive: true });
    await writeFile(path.join(target, 'old', 'SKILL.md'), '# old');

    const driver = new WindowsTargetDriver(target, 'test-sync');
    await driver.prepare(repository, [{ entryId: 'pack:Pack', sourceRelativePath: path.join('Pack', 'nested'), destinationName: 'nested' }]);
    await driver.commit();
    expect(await readdir(target)).toEqual(['nested']);
    expect(await readFile(path.join(target, 'nested', 'SKILL.md'), 'utf8')).toBe('# packed');

    await driver.rollback();
    expect(await readdir(target)).toEqual(['old']);
    await driver.cleanup();
  });

  it('does not clear an untouched target when no backup exists', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clankerskills-target-'));
    temporaryDirectories.push(root);
    const target = path.join(root, '.agents', 'skills');
    await mkdir(path.join(target, 'keep'), { recursive: true });
    const driver = new WindowsTargetDriver(target, 'not-started');
    await driver.rollback();
    expect(await readdir(target)).toEqual(['keep']);
  });
});

