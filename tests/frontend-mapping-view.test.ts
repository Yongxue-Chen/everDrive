import { describe, expect, it } from 'vitest';
import { describeSource, displaySourcePath, fallbackDestination, flowFromMapping, flowFromWorkspace } from '../frontend/src/lib/mapping-view.js';
import { formatRelative, sizeToBytes } from '../frontend/src/lib/format.js';
import type { MappingTaskItem, WorkspaceItem } from '../frontend/src/lib/types.js';

const remote = (partial: Partial<MappingTaskItem['remotes'][number]>): MappingTaskItem['remotes'][number] => ({
  remoteId: '1',
  remoteName: 'gdrive',
  displayName: 'Google Drive',
  role: 'primary',
  priority: 1,
  remoteBasePath: '',
  isActive: true,
  healthStatus: 'healthy',
  availableCapacityBytes: '0',
  ...partial
});

const mapping = (partial: Partial<MappingTaskItem>): MappingTaskItem => ({
  id: '1',
  name: 'Photos',
  local_path: '/data/photos',
  source_type: 'local',
  source_remote_name: null,
  source_path: '',
  remotes: [],
  sync_mode: 'archive',
  encryption_enabled: false,
  redundancy_enabled: false,
  split_enabled: false,
  last_sync_at: null,
  status: 'active',
  created_at: '',
  updated_at: '',
  ...partial
});

describe('mapping view helpers', () => {
  it('shows the real readonly source instead of the internal rclone:// path', () => {
    const source = describeSource(
      { source_type: 'rclone', source_remote_name: 'nas', source_path: 'photos/2026', local_path: 'rclone://nas/photos/2026' },
      [{ name: 'nas', type: 'smb' }]
    );
    expect(source).toEqual({ kind: 'rclone', title: 'nas（SMB）', path: '/photos/2026', short: 'nas:/photos/2026' });
    expect(describeSource({ local_path: '/data/docs' })).toEqual({ kind: 'local', title: '服务器本地目录', path: '/data/docs', short: '/data/docs' });
    expect(describeSource({ local_path: 'rclone://nas/photos' })).toMatchObject({ kind: 'rclone', short: 'nas:/photos' });
    expect(displaySourcePath('rclone://飞牛/secret')).toBe('飞牛:/secret');
    expect(displaySourcePath('/data/photos')).toBe('/data/photos');
  });

  it('orders targets by priority and uses the backend destination path', () => {
    const flow = flowFromMapping(
      mapping({
        redundancy_enabled: true,
        remotes: [
          remote({ remoteId: '2', displayName: 'OneDrive', role: 'backup', priority: 2, destinationPath: 'od:/everdrive/photos' }),
          remote({ remoteId: '1', role: 'primary', priority: 1, remoteBasePath: 'photos' })
        ]
      })
    );
    expect(flow.strategy).toBe('redundancy');
    expect(flow.targets.map((target) => [target.displayName, target.role, target.path])).toEqual([
      ['Google Drive', 'primary', 'gdrive:/photos'],
      ['OneDrive', 'backup', 'od:/everdrive/photos']
    ]);
  });

  it('marks split targets as shards and reads workspace items', () => {
    const workspace = {
      mapping_task_id: '9',
      name: 'Media',
      local_path: '/data/media',
      split_enabled: true,
      redundancy_enabled: false,
      encryption_enabled: true,
      remotes: [{ remote_id: '1', remote_name: 'a', display_name: 'A', role: 'shard', priority: 1, health_status: 'healthy', is_active: true, destination_path: 'a:/media' }]
    } as unknown as WorkspaceItem;
    const flow = flowFromWorkspace(workspace);
    expect(flow.strategy).toBe('split');
    expect(flow.encrypted).toBe(true);
    expect(flow.targets[0]).toMatchObject({ role: 'shard', path: 'a:/media' });
  });

  it('joins destination segments without duplicate slashes', () => {
    expect(fallbackDestination('blomp', '/user@example.com/', '/photos/')).toBe('blomp:/user@example.com/photos');
    expect(fallbackDestination('gdrive')).toBe('gdrive:/');
  });
});

describe('format helpers for the refreshed UI', () => {
  it('formats relative time in Chinese', () => {
    const now = new Date('2026-10-25T12:00:00Z').getTime();
    expect(formatRelative('2026-10-25T11:59:50Z', now)).toBe('刚刚');
    expect(formatRelative('2026-10-25T11:55:00Z', now)).toBe('5 分钟前');
    expect(formatRelative('2026-10-25T14:00:00Z', now)).toBe('2 小时后');
    expect(formatRelative(null, now)).toBe('从未');
  });

  it('converts sizes with units to bytes', () => {
    expect(sizeToBytes('1', 'GB')).toBe('1073741824');
    expect(sizeToBytes('1.5', 'TB')).toBe(String(1.5 * 1024 ** 4));
    expect(sizeToBytes('', 'TB')).toBe('');
    expect(sizeToBytes('-2', 'GB')).toBe('');
  });
});
