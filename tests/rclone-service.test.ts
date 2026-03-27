import { describe, expect, it, vi } from 'vitest';
import { RcloneService } from '../src/infrastructure/rclone/rclone.service.js';
import type { IRcloneClient, RcloneJobStatus } from '../src/infrastructure/rclone/rclone-rcd-client.js';

const okResult = { async: false as const, result: {} };

function createClientStub(overrides: Partial<IRcloneClient> = {}): IRcloneClient {
  return {
    checkOnline: vi.fn(async () => true),
    listRemotes: vi.fn(async () => ['driveA']),
    getAbout: vi.fn(async () => ({ total: null, used: null, free: null })),
    stat: vi.fn(async () => true),
    getConfigProviders: vi.fn(async () => ({ providers: [] })),
    copy: vi.fn(async () => okResult),
    sync: vi.fn(async () => okResult),
    move: vi.fn(async () => okResult),
    deleteFile: vi.fn(async () => okResult),
    purge: vi.fn(async () => okResult),
    mkdir: vi.fn(async () => okResult),
    copyRemoteToRemote: vi.fn(async () => okResult),
    getJobStatus: vi.fn(async () => ({
      finished: true,
      success: true
    })),
    ...overrides
  };
}

describe('RcloneService', () => {
  it('waits for async job completion', async () => {
    const statuses: RcloneJobStatus[] = [
      { finished: false, success: false },
      { finished: false, success: false },
      { finished: true, success: true }
    ];

    const client = createClientStub({
      getJobStatus: vi.fn(async () => statuses.shift() ?? { finished: true, success: true })
    });

    const service = new RcloneService(client);
    await expect(service.waitForJob(42, { timeoutMs: 3000, intervalMs: 1 })).resolves.toMatchObject({
      finished: true,
      success: true
    });
  });

  it('throws when async job finishes with failure', async () => {
    const client = createClientStub({
      getJobStatus: vi.fn(async () => ({
        finished: true,
        success: false,
        error: 'copy failed'
      }))
    });

    const service = new RcloneService(client);

    await expect(service.waitForJob(43, { timeoutMs: 1000, intervalMs: 1 })).rejects.toThrow('copy failed');
  });

  it('delegates remote-to-remote copy', async () => {
    const copyRemoteToRemote = vi.fn(async () => okResult);
    const client = createClientStub({ copyRemoteToRemote });
    const service = new RcloneService(client);

    await service.remoteToRemoteCopy({
      sourceRemote: 'driveA:',
      sourcePath: 'photos',
      targetRemote: 'driveB:',
      targetPath: 'archive'
    });

    expect(copyRemoteToRemote).toHaveBeenCalledWith({
      srcFs: 'driveA:',
      srcRemote: 'photos',
      dstFs: 'driveB:',
      dstRemote: 'archive',
      async: false
    });
  });
});
