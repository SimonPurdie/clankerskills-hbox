import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { openFolderWithExplorer } from '../src/server/platform';

describe('openFolderWithExplorer', () => {
  it('resolves after Explorer starts without waiting for its handoff exit code', async () => {
    const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> };
    child.unref = vi.fn();
    const spawn = vi.fn(() => child) as unknown as Parameters<typeof openFolderWithExplorer>[1];
    const opened = openFolderWithExplorer('C:\\Users\\Test\\.agents\\skills', spawn);
    child.emit('spawn');
    await expect(opened).resolves.toBeUndefined();
    child.emit('exit', 1);
    expect(child.unref).toHaveBeenCalledOnce();
    expect(spawn).toHaveBeenCalledWith(
      expect.stringMatching(/^C:\\Windows\\explorer\.exe$/i),
      ['C:\\Users\\Test\\.agents\\skills'],
      expect.objectContaining({ windowsHide: false }),
    );
  });

  it('rejects when Explorer cannot be spawned', async () => {
    const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> };
    child.unref = vi.fn();
    const spawn = vi.fn(() => child) as unknown as Parameters<typeof openFolderWithExplorer>[1];
    const opened = openFolderWithExplorer('C:\\missing', spawn);
    child.emit('error', new Error('spawn failed'));
    await expect(opened).rejects.toThrow('spawn failed');
  });
});
