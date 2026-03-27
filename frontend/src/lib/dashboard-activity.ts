import type { WorkspaceItem } from './types.js';
import { formatDate } from './format.js';

export type RecentSyncSummary = {
  mappingTaskId: string;
  name: string;
  statusLabel: string;
  tone: 'good' | 'warn' | 'bad';
  detail: string;
};

export function buildRecentSyncSummaries(items: WorkspaceItem[]): RecentSyncSummary[] {
  return items.map((item) => ({
    mappingTaskId: item.mapping_task_id,
    name: item.name,
    statusLabel: mapStatusLabel(item.sync_status),
    tone: mapTone(item.sync_status),
    detail: buildDetail(item)
  }));
}

function mapStatusLabel(status: WorkspaceItem['sync_status']): string {
  if (status === 'green') {
    return '同步正常';
  }
  if (status === 'yellow') {
    return '等待检查';
  }
  return '需要处理';
}

function mapTone(status: WorkspaceItem['sync_status']): 'good' | 'warn' | 'bad' {
  if (status === 'green') {
    return 'good';
  }
  if (status === 'yellow') {
    return 'warn';
  }
  return 'bad';
}

function buildDetail(item: WorkspaceItem): string {
  if (!item.last_sync_at) {
    return '还没有成功同步记录';
  }

  return `最近成功同步于 ${formatDate(item.last_sync_at)}`;
}
