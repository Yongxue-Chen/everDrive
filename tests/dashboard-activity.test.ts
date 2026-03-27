import { describe, expect, it } from 'vitest';
import type { WorkspaceItem } from '../frontend/src/lib/types.js';
import { buildRecentSyncSummaries } from '../frontend/src/lib/dashboard-activity.js';

describe('dashboard activity summaries', () => {
  it('builds user-facing sync summaries from workspace items', () => {
    const items: WorkspaceItem[] = [
      {
        mapping_task_id: '1',
        name: '照片归档',
        local_path: '/data/photos',
        remotes: [],
        sync_status: 'green',
        last_sync_at: '2026-03-27T18:00:00.000Z',
        encryption_enabled: false,
        redundancy_enabled: false,
        replica_count: 1,
        file_count: 12,
        total_size: '1024'
      },
      {
        mapping_task_id: '2',
        name: '文档镜像',
        local_path: '/data/docs',
        remotes: [],
        sync_status: 'red',
        last_sync_at: null,
        encryption_enabled: false,
        redundancy_enabled: false,
        replica_count: 1,
        file_count: 4,
        total_size: '2048'
      }
    ];

    const summaries = buildRecentSyncSummaries(items);

    expect(summaries).toEqual([
      {
        mappingTaskId: '1',
        name: '照片归档',
        statusLabel: '同步正常',
        tone: 'good',
        detail: '最近成功同步于 2026-03-27 18:00:00'
      },
      {
        mappingTaskId: '2',
        name: '文档镜像',
        statusLabel: '需要处理',
        tone: 'bad',
        detail: '还没有成功同步记录'
      }
    ]);
  });
});
