import { cp, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedSkill } from '../shared/types';
import type { PlatformServices, WslTarget } from './platform';

export interface SyncTargetDriver {
  prepare(repositoryPath: string, skills: ResolvedSkill[]): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  cleanup(): Promise<void>;
}

async function moveChildren(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  let entries;
  try {
    entries = await readdir(source);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const name of entries) await rename(path.join(source, name), path.join(destination, name));
}

export class WindowsTargetDriver implements SyncTargetDriver {
  private readonly parent: string;
  private readonly stage: string;
  private readonly backup: string;

  constructor(private readonly targetPath: string, syncId: string) {
    this.parent = path.dirname(targetPath);
    this.stage = path.join(this.parent, `.clankerskills-${syncId}-stage`);
    this.backup = path.join(this.parent, `.clankerskills-${syncId}-backup`);
  }

  async prepare(repositoryPath: string, skills: ResolvedSkill[]): Promise<void> {
    await mkdir(this.parent, { recursive: true });
    await mkdir(this.targetPath, { recursive: true });
    await rm(this.stage, { recursive: true, force: true });
    await rm(this.backup, { recursive: true, force: true });
    await mkdir(this.stage);
    for (const skill of skills) {
      await cp(
        path.join(repositoryPath, skill.sourceRelativePath),
        path.join(this.stage, skill.destinationName),
        { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true, verbatimSymlinks: true },
      );
    }
  }

  async commit(): Promise<void> {
    await mkdir(this.backup);
    try {
      await moveChildren(this.targetPath, this.backup);
      await moveChildren(this.stage, this.targetPath);
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  async rollback(): Promise<void> {
    try {
      try {
        await stat(this.backup);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      await rm(this.targetPath, { recursive: true, force: true });
      await mkdir(this.targetPath, { recursive: true });
      await moveChildren(this.backup, this.targetPath);
      await rm(this.backup, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Windows target rollback failed: ${(error as Error).message}`, { cause: error });
    }
  }

  async cleanup(): Promise<void> {
    await rm(this.stage, { recursive: true, force: true });
    await rm(this.backup, { recursive: true, force: true });
  }
}

export class WslTargetDriver implements SyncTargetDriver {
  constructor(
    private readonly platform: PlatformServices,
    private readonly target: WslTarget,
    private readonly helperWindowsPath: string,
    private readonly syncId: string,
  ) {}

  private async run(operation: string, extra: string[] = []): Promise<void> {
    const helper = await this.platform.convertWindowsPath(this.target, this.helperWindowsPath);
    await this.platform.runWsl(this.target, ['sh', helper, operation, this.target.linuxPath, this.syncId, ...extra]);
  }

  async prepare(repositoryPath: string, skills: ResolvedSkill[]): Promise<void> {
    const repository = await this.platform.convertWindowsPath(this.target, repositoryPath);
    const pairs = skills.flatMap((skill) => [skill.sourceRelativePath.replaceAll('\\', '/'), skill.destinationName]);
    await this.run('prepare', [repository, ...pairs]);
  }

  commit(): Promise<void> {
    return this.run('commit');
  }

  rollback(): Promise<void> {
    return this.run('rollback');
  }

  cleanup(): Promise<void> {
    return this.run('cleanup');
  }
}
