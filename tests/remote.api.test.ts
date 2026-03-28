import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app/create-app.js';
import { createRemoteRouter } from '../src/modules/remote/remote.controller.js';

describe('remote API', () => {
  it('creates a business remote through POST /api/remotes', async () => {
    const service = {
      createRemote: vi.fn(async () => ({
        id: '11',
        remoteName: 'driveA',
        displayName: '相册盘',
        remoteRootPath: '',
        isActive: true,
        cloudTrashEnabled: false,
        cloudTrashBasePath: '.everdrive-trash',
        healthStatus: 'healthy',
        capacity: {
          totalCapacityBytes: '1000',
          usedCapacityBytes: '0',
          reservedCapacityBytes: '0',
          remainingCapacityBytes: '1000',
          usagePercent: 0,
          warningThresholdPercent: 85,
          alert: false,
          realUsageAvailable: false
        },
        mappedDirectories: [],
        lastSyncAt: null,
        updatedAt: new Date().toISOString()
      }))
    } as any;

    const queue = { enqueue: vi.fn() } as any;
    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true,
      remoteRouter: createRemoteRouter(service, queue)
    });

    const response = await request(app).post('/api/remotes').send({
      displayName: '相册盘',
      remoteName: 'driveA',
      totalCapacity: '1000'
    });

    expect(response.status).toBe(201);
    expect(service.createRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: '相册盘',
        remoteName: 'driveA'
      })
    );
  });

  it('returns current rclone remote options', async () => {
    const service = {
      listRcloneRemoteOptions: vi.fn(async () => [
        { remoteName: 'driveA', available: true },
        { remoteName: 'driveB', available: false, boundRemoteId: '11', boundDisplayName: '相册盘' }
      ])
    } as any;

    const queue = { enqueue: vi.fn() } as any;
    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true,
      remoteRouter: createRemoteRouter(service, queue)
    });

    const response = await request(app).get('/api/remotes/rclone-options');

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      { remoteName: 'driveA', available: true },
      { remoteName: 'driveB', available: false, boundRemoteId: '11', boundDisplayName: '相册盘' }
    ]);
  });

  it('deletes a business remote through DELETE /api/remotes/:remoteId', async () => {
    const service = {
      deleteRemote: vi.fn(async () => undefined)
    } as any;

    const queue = { enqueue: vi.fn() } as any;
    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true,
      remoteRouter: createRemoteRouter(service, queue)
    });

    const response = await request(app).delete('/api/remotes/11');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deleted: true });
    expect(service.deleteRemote).toHaveBeenCalledWith(11n);
  });
});
