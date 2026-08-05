import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverCatalog } from '../src/server/catalog';

const temporaryDirectories: string[] = [];

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clankerskills-catalog-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function skill(directory: string, skillFile = 'SKILL.md'): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, skillFile), '# Skill\n');
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('discoverCatalog', () => {
  it('detects standalone skills and one-level packs', async () => {
    const root = await fixture();
    await skill(path.join(root, 'Alpha'));
    await skill(path.join(root, 'Bundle', 'Zulu'));
    await skill(path.join(root, 'Bundle', 'beta'), 'skill.MD');
    await mkdir(path.join(root, 'Bundle', 'notes'));
    await mkdir(path.join(root, 'ignored'));
    await skill(path.join(root, '.hidden'));

    expect(await discoverCatalog(root)).toEqual([
      {
        kind: 'skill',
        id: 'skill:Alpha',
        name: 'Alpha',
        relativePath: 'Alpha',
        destinationName: 'Alpha',
      },
      {
        kind: 'pack',
        id: 'pack:Bundle',
        name: 'Bundle',
        skills: [
          { name: 'beta', relativePath: path.join('Bundle', 'beta'), destinationName: 'beta' },
          { name: 'Zulu', relativePath: path.join('Bundle', 'Zulu'), destinationName: 'Zulu' },
        ],
      },
    ]);
  });

  it('treats a top-level SKILL.md as authoritative and does not recurse', async () => {
    const root = await fixture();
    await skill(path.join(root, 'Top'));
    await skill(path.join(root, 'Top', 'Nested'));
    await skill(path.join(root, 'Pack', 'Child', 'TooDeep'));

    expect(await discoverCatalog(root)).toEqual([
      {
        kind: 'skill',
        id: 'skill:Top',
        name: 'Top',
        relativePath: 'Top',
        destinationName: 'Top',
      },
    ]);
  });
});

