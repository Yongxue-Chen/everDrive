import type { MappingTaskItem, RcloneSourceOption, WorkspaceItem } from './types.js';

export type Strategy = 'single' | 'redundancy' | 'split';
export type TargetRole = 'primary' | 'backup' | 'shard';

export type FlowSource = {
  kind: 'local' | 'rclone';
  title: string;
  path: string;
};

export type FlowTarget = {
  remoteId: string;
  displayName: string;
  remoteName: string;
  role: TargetRole;
  path: string;
  health: string;
  availableBytes?: string;
};

export type FlowModel = {
  id: string;
  name: string;
  source: FlowSource;
  strategy: Strategy;
  syncMode: 'archive' | 'mirror';
  encrypted: boolean;
  targets: FlowTarget[];
};

export const strategyLabels: Record<Strategy, string> = {
  single: '单盘备份',
  redundancy: '多云冗余',
  split: '容量分片'
};

export const strategyFlowHints: Record<Strategy, string> = {
  single: '完整备份到',
  redundancy: '每个云盘各存一份完整副本',
  split: '文件拆分存放到各云盘'
};

export const strategyDescriptions: Record<Strategy, string> = {
  single: '所有文件备份到一个云盘，最简单。',
  redundancy: '每个云盘都保存一份完整副本，任一云盘出问题都不丢数据。第一个为主盘。',
  split: '文件按容量分散到多个云盘，适合数据量超过单个云盘容量的情况，但没有冗余。'
};

export const syncModeLabels: Record<'archive' | 'mirror', string> = {
  archive: '归档',
  mirror: '镜像'
};

export const syncModeDescriptions: Record<'archive' | 'mirror', string> = {
  archive: '只上传新增和修改的文件；来源中删除的文件，云端仍然保留。',
  mirror: '云端与来源保持一致；来源中删除的文件，云端也会被删除（可配合云端回收站）。'
};

export const roleLabels: Record<TargetRole, string> = {
  primary: '主盘',
  backup: '备份',
  shard: '分片'
};

export const healthLabels: Record<string, string> = {
  healthy: '健康',
  warning: '告警',
  full: '已满',
  unavailable: '不可用'
};

export function healthTone(health: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (health === 'healthy') return 'good';
  if (health === 'warning') return 'warn';
  if (health === 'full' || health === 'unavailable') return 'bad';
  return 'neutral';
}

export function resolveStrategy(flags: { redundancy_enabled: boolean; split_enabled?: boolean }): Strategy {
  if (flags.redundancy_enabled) return 'redundancy';
  if (flags.split_enabled) return 'split';
  return 'single';
}

function normalizeRole(role: string, strategy: Strategy, index: number): TargetRole {
  if (role === 'primary' || role === 'backup' || role === 'shard') return role;
  if (strategy === 'split') return 'shard';
  return index === 0 ? 'primary' : 'backup';
}

export function fallbackDestination(remoteName: string, ...segments: Array<string | null | undefined>): string {
  const joined = segments
    .map((segment) => (segment ?? '').trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return `${remoteName}:/${joined}`;
}

export function describeSource(
  item: { source_type?: 'local' | 'rclone'; source_remote_name?: string | null; source_path?: string; local_path: string },
  sources: RcloneSourceOption[] = []
): FlowSource {
  if (item.source_type === 'rclone' && item.source_remote_name) {
    const type = sources.find((source) => source.name === item.source_remote_name)?.type;
    return {
      kind: 'rclone',
      title: `${item.source_remote_name}${type ? `（${type.toUpperCase()}）` : ''}`,
      path: `/${(item.source_path ?? '').replace(/^\/+/, '')}`
    };
  }
  return { kind: 'local', title: '服务器本地目录', path: item.local_path };
}

export function flowFromMapping(item: MappingTaskItem, sources: RcloneSourceOption[] = []): FlowModel {
  const strategy = resolveStrategy(item);
  return {
    id: item.id,
    name: item.name,
    source: describeSource(item, sources),
    strategy,
    syncMode: item.sync_mode,
    encrypted: item.encryption_enabled,
    targets: [...item.remotes]
      .sort((a, b) => a.priority - b.priority)
      .map((remote, index) => ({
        remoteId: remote.remoteId,
        displayName: remote.displayName,
        remoteName: remote.remoteName,
        role: normalizeRole(remote.role, strategy, index),
        path: remote.destinationPath ?? fallbackDestination(remote.remoteName, remote.remoteRootPath, remote.remoteBasePath),
        health: remote.healthStatus,
        availableBytes: remote.availableCapacityBytes
      }))
  };
}

export function flowFromWorkspace(item: WorkspaceItem, sources: RcloneSourceOption[] = []): FlowModel {
  const strategy = resolveStrategy(item);
  return {
    id: item.mapping_task_id,
    name: item.name,
    source: describeSource(item, sources),
    strategy,
    syncMode: item.sync_mode ?? 'archive',
    encrypted: item.encryption_enabled,
    targets: [...item.remotes]
      .sort((a, b) => a.priority - b.priority)
      .map((remote, index) => ({
        remoteId: remote.remote_id,
        displayName: remote.display_name,
        remoteName: remote.remote_name,
        role: normalizeRole(remote.role, strategy, index),
        path: remote.destination_path ?? fallbackDestination(remote.remote_name),
        health: remote.health_status
      }))
  };
}
