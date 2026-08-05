import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { discoverCatalog } from './catalog';
import { loadSelectorConfig } from './config';
import { listLocalDirectories, type PlatformServices, type WslTarget } from './platform';
import { resolveSelection, sameResolvedSkills, sameStringSet } from '../shared/selection';
import type { AppState, CatalogEntry, SyncResponse, TargetInfo } from '../shared/types';
import { SyncEngine } from './sync-engine';

export class AppService {
  private syncing = false;
  private recoveryError?: string;
  private recoveryWarnings: string[] = [];

  constructor(
    private readonly platform: PlatformServices,
    private readonly syncEngine: SyncEngine,
    private readonly csrfToken: string,
  ) {}

  async initialize(): Promise<void> {
    await mkdir(this.platform.repositoryPath, { recursive: true });
    try {
      this.recoveryWarnings = await this.syncEngine.recover();
    } catch (error) {
      this.recoveryError = (error as Error).message;
    }
  }

  async retryRecovery(): Promise<string[]> {
    if (this.syncing) throw Object.assign(new Error('Recovery is blocked while syncing.'), { statusCode: 409 });
    try {
      const warnings = await this.syncEngine.recover();
      this.recoveryError = undefined;
      this.recoveryWarnings = warnings;
      return warnings;
    } catch (error) {
      this.recoveryError = (error as Error).message;
      throw error;
    }
  }

  isSyncing(): boolean {
    return this.syncing;
  }

  private async detectTargets(): Promise<{ wsl?: WslTarget; targets: TargetInfo[]; warning?: string }> {
    const targets: TargetInfo[] = [
      { kind: 'windows', path: this.platform.windowsTargetPath, available: true },
    ];
    try {
      const wsl = await this.platform.detectWsl();
      targets.push({ kind: 'wsl', path: wsl.windowsPath, available: true, detail: wsl.distro });
      return { wsl, targets };
    } catch (error) {
      targets.push({ kind: 'wsl', path: 'Default WSL distro', available: false, detail: (error as Error).message });
      return { targets, warning: `WSL is unavailable: ${(error as Error).message}` };
    }
  }

  async getState(): Promise<AppState> {
    const entries = await discoverCatalog(this.platform.repositoryPath);
    const { config, warning: configWarning } = await loadSelectorConfig(this.platform.repositoryPath);
    const { wsl, targets, warning: targetWarning } = await this.detectTargets();

    let initialSelection: string[];
    let baselineSelection: string[];
    let baselineResolvedSkills = config?.resolvedSkills ?? [];
    if (config) {
      const knownIds = new Set(entries.map((entry) => entry.id));
      initialSelection = config.selectedEntries.filter((id) => knownIds.has(id));
      baselineSelection = config.selectedEntries;
    } else {
      const windowsNames = await listLocalDirectories(this.platform.windowsTargetPath);
      const wslNames = wsl ? await this.platform.listWslDirectories(wsl) : [];
      const activeNames = new Set([...windowsNames, ...wslNames].map((name) => name.toLocaleLowerCase('en-US')));
      initialSelection = entries
        .filter((entry) => entry.kind === 'skill' && activeNames.has(entry.destinationName.toLocaleLowerCase('en-US')))
        .map((entry) => entry.id);
      baselineSelection = [];
      baselineResolvedSkills = [];
    }

    const warnings = [configWarning, targetWarning, ...this.recoveryWarnings].filter(Boolean).join(' ');
    return {
      entries,
      initialSelection,
      baselineSelection,
      baselineResolvedSkills,
      targets,
      repositoryPath: this.platform.repositoryPath,
      syncing: this.syncing,
      targetDrift: Boolean(config && wsl && (config.wslDistro !== wsl.distro || config.wslHome !== wsl.home)),
      csrfToken: this.csrfToken,
      warning: warnings || undefined,
      recoveryError: this.recoveryError,
    };
  }

  async sync(selectedIds: string[]): Promise<SyncResponse> {
    if (this.syncing) throw Object.assign(new Error('A sync is already running.'), { statusCode: 409 });
    if (this.recoveryError) throw Object.assign(new Error('An interrupted sync must be recovered first.'), { statusCode: 409 });
    this.syncing = true;
    try {
      const entries = await discoverCatalog(this.platform.repositoryPath);
      const result = await this.syncEngine.sync(entries, selectedIds);
      return {
        selectedEntries: result.config.selectedEntries,
        resolvedSkills: result.config.resolvedSkills,
        warnings: result.warnings,
      };
    } finally {
      this.syncing = false;
    }
  }

  async openFolder(target: 'repository' | 'windows' | 'wsl'): Promise<void> {
    if (target === 'repository') return this.platform.openFolder(this.platform.repositoryPath);
    if (target === 'windows') {
      await mkdir(this.platform.windowsTargetPath, { recursive: true });
      return this.platform.openFolder(this.platform.windowsTargetPath);
    }
    const wsl = await this.platform.detectWsl();
    await this.platform.runWsl(wsl, ['mkdir', '-p', wsl.linuxPath]);
    return this.platform.openFolder(wsl.windowsPath);
  }

  static isDirty(entries: CatalogEntry[], selected: string[], baseline: string[], baselineSkills: AppState['baselineResolvedSkills']): boolean {
    const current = resolveSelection(entries, selected).resolvedSkills;
    return !sameStringSet(selected, baseline) || !sameResolvedSkills(current, baselineSkills);
  }
}
