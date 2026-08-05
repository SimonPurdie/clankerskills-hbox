import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { compareNames } from '../shared/selection';
import type { CatalogEntry, PackEntry, StandaloneSkillEntry } from '../shared/types';

async function containsSkillFile(directory: string): Promise<boolean> {
  const children = await readdir(directory, { withFileTypes: true });
  return children.some((child) => child.isFile() && child.name.toLocaleLowerCase('en-US') === 'skill.md');
}

export async function discoverCatalog(repositoryPath: string): Promise<CatalogEntry[]> {
  const topLevel = (await readdir(repositoryPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => compareNames(a.name, b.name));

  const catalog: CatalogEntry[] = [];
  for (const directory of topLevel) {
    const absolutePath = path.join(repositoryPath, directory.name);
    if (await containsSkillFile(absolutePath)) {
      const entry: StandaloneSkillEntry = {
        kind: 'skill',
        id: `skill:${directory.name}`,
        name: directory.name,
        relativePath: directory.name,
        destinationName: directory.name,
      };
      catalog.push(entry);
      continue;
    }

    const children = (await readdir(absolutePath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .sort((a, b) => compareNames(a.name, b.name));
    const skills = [];
    for (const child of children) {
      const childAbsolutePath = path.join(absolutePath, child.name);
      if (await containsSkillFile(childAbsolutePath)) {
        skills.push({
          name: child.name,
          relativePath: path.join(directory.name, child.name),
          destinationName: child.name,
        });
      }
    }

    if (skills.length > 0) {
      const entry: PackEntry = {
        kind: 'pack',
        id: `pack:${directory.name}`,
        name: directory.name,
        skills,
      };
      catalog.push(entry);
    }
  }

  return catalog;
}

