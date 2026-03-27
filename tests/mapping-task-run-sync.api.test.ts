import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app/create-app.js';
import { createMappingTaskRouter } from '../src/modules/mapping-task/mapping-task.controller.js';

describe('mapping task run-sync API', () => {
  it('enqueues scan, rename_detect and sync jobs for a mapping task', async () => {
    const service = {
      getTaskDetail: vi.fn(async () => ({
        id: '9',
        name: 'photos',
        local_path: '/data/photos',
        remotes: [],
        sync_mode: 'archive',
        encryption_enabled: false,
        redundancy_enabled: false,
        split_enabled: false,
        last_sync_at: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))
    } as any;

    const queue = {
      enqueue: vi
        .fn()
        .mockReturnValueOnce({ id: 'scan-1', kind: 'scan' })
        .mockReturnValueOnce({ id: 'rename-1', kind: 'rename_detect' })
        .mockReturnValueOnce({ id: 'sync-1', kind: 'sync' })
    } as any;

    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true,
      mappingTaskRouter: createMappingTaskRouter(service, queue)
    });

    const response = await request(app).post('/api/mapping-tasks/9/run-sync');

    expect(response.status).toBe(202);
    expect(queue.enqueue).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'scan', mappingTaskId: 9n }));
    expect(queue.enqueue).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'rename_detect', mappingTaskId: 9n }));
    expect(queue.enqueue).toHaveBeenNthCalledWith(3, expect.objectContaining({ kind: 'sync', mappingTaskId: 9n }));
  });
});
