import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedSkill, SelectorConfig } from '../shared/types';

export const CONFIG_FILENAME = '.skill-selector.json';
export const JOURNAL_FILENAME = '.skill-selector.transaction.json';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isResolvedSkill(value: unknown): value is ResolvedSkill {
  if (!value || typeof value !== 'object') return false;
  const skill = value as Record<string, unknown>;
  return (
    typeof skill.entryId === 'string' &&
    typeof skill.sourceRelativePath === 'string' &&
    typeof skill.destinationName === 'string'
  );
}

export function isSelectorConfig(value: unknown): value is SelectorConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return (
    config.version === 1 &&
    isStringArray(config.selectedEntries) &&
    Array.isArray(config.resolvedSkills) &&
    config.resolvedSkills.every(isResolvedSkill) &&
    typeof config.syncId === 'string' &&
    config.syncId.length > 0 &&
    typeof config.wslDistro === 'string' &&
    config.wslDistro.length > 0 &&
    typeof config.wslHome === 'string' &&
    config.wslHome.length > 0
  );
}

export async function loadSelectorConfig(repositoryPath: string): Promise<{
  config: SelectorConfig | null;
  warning?: string;
}> {
  const configPath = path.join(repositoryPath, CONFIG_FILENAME);
  try {
    const parsed: unknown = JSON.parse(await readFile(configPath, 'utf8'));
    if (isSelectorConfig(parsed)) return { config: parsed };
    return { config: null, warning: 'Existing selector state is from an unsupported version and will be replaced after Sync.' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { config: null };
    return { config: null, warning: 'Selector state could not be read and will be replaced after Sync.' };
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function writeSelectorConfig(repositoryPath: string, config: SelectorConfig): Promise<void> {
  await writeJsonAtomic(path.join(repositoryPath, CONFIG_FILENAME), config);
}
