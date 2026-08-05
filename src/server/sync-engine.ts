import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { resolveSelection } from '../shared/selection';
import type { CatalogEntry, ResolvedSkill, SelectorConfig } from '../shared/types';
import { JOURNAL_FILENAME, isSelectorConfig, writeJsonAtomic, writeSelectorConfig } from './config';
import type { PlatformServices, WslTarget } from './platform';
import { WindowsTargetDriver, WslTargetDriver, type SyncTargetDriver } from './targets';

interface SyncJournal {
  version: 1;
  syncId: string;
  phase: 'prepared' | 'windows-committed' | 'targets-committed';
  wsl: WslTarget;
}

function isJournal(value: unknown): value is SyncJournal {
  if (!value || typeof value !== 'object') return false;
  const journal = value as Record<string, unknown>;
  const wsl = journal.wsl as Record<string, unknown> | undefined;
  return (
    journal.version === 1 &&
    typeof journal.syncId === 'string' &&
    ['prepared', 'windows-committed', 'targets-committed'].includes(String(journal.phase)) &&
    !!wsl &&
    typeof wsl.distro === 'string' &&
    typeof wsl.home === 'string' &&
    typeof wsl.linuxPath === 'string' &&
    typeof wsl.windowsPath === 'string'
  );
}

async function settleAll(operation: string, drivers: SyncTargetDriver[], method: 'rollback' | 'cleanup'): Promise<string[]> {
  const results = await Promise.allSettled(drivers.map((driver) => driver[method]()));
  return results.flatMap((result, index) =>
    result.status === 'rejected' ? [`${operation} failed for target ${index + 1}: ${String(result.reason)}`] : [],
  );
}

export interface SyncEngineOptions {
  platform: PlatformServices;
  projectRoot: string;
}

export class SyncEngine {
  private readonly journalPath: string;
  private readonly helperPath: string;

  constructor(private readonly options: SyncEngineOptions) {
    this.journalPath = path.join(options.platform.repositoryPath, JOURNAL_FILENAME);
    this.helperPath = path.join(options.projectRoot, 'dist', 'server', 'wsl-sync.sh');
  }

  private drivers(syncId: string, wsl: WslTarget): SyncTargetDriver[] {
    return [
      new WindowsTargetDriver(this.options.platform.windowsTargetPath, syncId),
      new WslTargetDriver(this.options.platform, wsl, this.helperPath, syncId),
    ];
  }

  private async writeJournal(journal: SyncJournal): Promise<void> {
    await writeJsonAtomic(this.journalPath, journal);
  }

  async recover(): Promise<string[]> {
    let journal: SyncJournal;
    try {
      const parsed: unknown = JSON.parse(await readFile(this.journalPath, 'utf8'));
      if (!isJournal(parsed)) throw new Error('The transaction journal has an unsupported format.');
      journal = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new Error(`Sync recovery could not read its journal: ${(error as Error).message}`, { cause: error });
    }

    const drivers = this.drivers(journal.syncId, journal.wsl);
    let committed = false;
    try {
      const parsed: unknown = JSON.parse(
        await readFile(path.join(this.options.platform.repositoryPath, '.skill-selector.json'), 'utf8'),
      );
      committed = isSelectorConfig(parsed) && parsed.syncId === journal.syncId;
    } catch {
      committed = false;
    }

    const errors = committed
      ? await settleAll('Recovery cleanup', drivers, 'cleanup')
      : await settleAll('Recovery rollback', drivers, 'rollback');
    if (errors.length > 0) throw new Error(errors.join('\n'));
    await settleAll('Recovery cleanup', drivers, 'cleanup');
    await rm(this.journalPath, { force: true });
    return committed ? ['Finished cleanup from the previous successful sync.'] : ['Restored targets after an interrupted sync.'];
  }

  async sync(entries: CatalogEntry[], selectedIds: string[]): Promise<{
    config: SelectorConfig;
    warnings: string[];
  }> {
    const uniqueSelection = [...new Set(selectedIds)];
    const { resolvedSkills, conflicts, unknownIds } = resolveSelection(entries, uniqueSelection);
    if (unknownIds.length > 0) throw new Error(`Unknown or stale selection: ${unknownIds.join(', ')}`);
    if (conflicts.length > 0) {
      const names = conflicts.map((conflict) => conflict.destinationName).join(', ');
      throw new Error(`Selected skills have conflicting destination names: ${names}`);
    }

    const syncId = crypto.randomUUID();
    const wsl = await this.options.platform.detectWsl();
    const drivers = this.drivers(syncId, wsl);
    let journalWritten = false;
    let configWritten = false;

    try {
      await Promise.all(drivers.map((driver) => driver.prepare(this.options.platform.repositoryPath, resolvedSkills)));
      await this.writeJournal({ version: 1, syncId, phase: 'prepared', wsl });
      journalWritten = true;

      await drivers[0].commit();
      await this.writeJournal({ version: 1, syncId, phase: 'windows-committed', wsl });
      await drivers[1].commit();
      await this.writeJournal({ version: 1, syncId, phase: 'targets-committed', wsl });

      const config: SelectorConfig = {
        version: 1,
        selectedEntries: uniqueSelection.sort(),
        resolvedSkills,
        syncId,
        wslDistro: wsl.distro,
        wslHome: wsl.home,
      };
      await writeSelectorConfig(this.options.platform.repositoryPath, config);
      configWritten = true;

      const warnings = await settleAll('Cleanup', drivers, 'cleanup');
      if (warnings.length === 0) await rm(this.journalPath, { force: true });
      return { config, warnings };
    } catch (error) {
      if (!configWritten && journalWritten) {
        const rollbackErrors = await settleAll('Rollback', drivers, 'rollback');
        const cleanupErrors = rollbackErrors.length === 0
          ? await settleAll('Cleanup', drivers, 'cleanup')
          : [];
        const recoveryErrors = [...rollbackErrors, ...cleanupErrors];
        if (recoveryErrors.length === 0) await rm(this.journalPath, { force: true });
        if (recoveryErrors.length > 0) {
          throw new Error(`${(error as Error).message}\n${recoveryErrors.join('\n')}`, { cause: error });
        }
      } else if (!journalWritten) {
        await settleAll('Preparation cleanup', drivers, 'cleanup');
      }
      throw error;
    }
  }
}
