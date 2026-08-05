import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { compareNames } from '../shared/selection';

const execFileAsync = promisify(execFile);

export interface WslTarget {
  distro: string;
  home: string;
  linuxPath: string;
  windowsPath: string;
}

export interface PlatformServices {
  windowsHome: string;
  repositoryPath: string;
  windowsTargetPath: string;
  detectWsl(): Promise<WslTarget>;
  listWslDirectories(target: WslTarget): Promise<string[]>;
  convertWindowsPath(target: WslTarget, windowsPath: string): Promise<string>;
  runWsl(target: WslTarget, args: string[]): Promise<void>;
  openFolder(folderPath: string): Promise<void>;
}

function cleanWslOutput(output: string): string[] {
  return output.replaceAll('\u0000', '').replaceAll('\r', '').split('\n').filter(Boolean);
}

export function createPlatformServices(): PlatformServices {
  const windowsHome = os.homedir();
  const wslExecutable = 'C:\\Windows\\System32\\wsl.exe';
  return {
    windowsHome,
    repositoryPath: path.join(windowsHome, '.agent-skill-repo'),
    windowsTargetPath: path.join(windowsHome, '.agents', 'skills'),
    async detectWsl() {
      const script = 'printf "%s\\n%s\\n" "$WSL_DISTRO_NAME" "$HOME"; wslpath -w "$HOME/.agents/skills"';
      const { stdout } = await execFileAsync(wslExecutable, ['--exec', 'sh', '-lc', script], {
        encoding: 'utf8',
        windowsHide: true,
      });
      const [distro, home, windowsPath] = cleanWslOutput(stdout);
      if (!distro || !home || !windowsPath) throw new Error('The default WSL distro did not return its name and home path.');
      return { distro, home, linuxPath: `${home}/.agents/skills`, windowsPath };
    },
    async listWslDirectories(target) {
      const script = 'target=$1; [ -d "$target" ] || exit 0; find "$target" -mindepth 1 -maxdepth 1 -type d -printf "%f\\n"';
      const { stdout } = await execFileAsync(
        wslExecutable,
        ['-d', target.distro, '--exec', 'sh', '-c', script, 'clankerskills', target.linuxPath],
        { encoding: 'utf8', windowsHide: true },
      );
      return cleanWslOutput(stdout).sort(compareNames);
    },
    async convertWindowsPath(target, windowsPath) {
      const { stdout } = await execFileAsync(
        wslExecutable,
        ['-d', target.distro, '--exec', 'wslpath', '-u', windowsPath],
        { encoding: 'utf8', windowsHide: true },
      );
      const [converted] = cleanWslOutput(stdout);
      if (!converted) throw new Error(`WSL could not convert Windows path: ${windowsPath}`);
      return converted;
    },
    async runWsl(target, args) {
      await execFileAsync(wslExecutable, ['-d', target.distro, '--exec', ...args], {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });
    },
    async openFolder(folderPath) {
      await execFileAsync('explorer.exe', [folderPath], { encoding: 'utf8', windowsHide: true });
    },
  };
}

export async function listLocalDirectories(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareNames);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

