import { formatDate, formatGigabytes } from '../lib/format';
import type { MappingTaskItem, MappingTaskListResponse } from '../lib/types';

type MappingTableProps = {
  items: MappingTaskListResponse['items'];
  pendingTaskId?: string | null;
  onEdit: (item: MappingTaskItem) => void;
  onRunSync: (item: MappingTaskItem) => void;
  onToggleActive: (item: MappingTaskItem) => void;
  onDelete: (item: MappingTaskItem) => void;
};

const statusLabels: Record<MappingTaskItem['status'], string> = {
  active: '启用中',
  inactive: '已停用',
  deleted: '已删除'
};

const roleLabels: Record<string, string> = {
  primary: '主盘',
  backup: '备份盘',
  shard: '分片'
};

const modeLabels: Record<MappingTaskItem['sync_mode'], string> = {
  archive: '归档',
  mirror: '镜像'
};

export function MappingTable({ items, pendingTaskId, onEdit, onRunSync, onToggleActive, onDelete }: MappingTableProps) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>映射名称</th>
            <th>本地路径</th>
            <th>同步模式</th>
            <th>远端绑定</th>
            <th>状态</th>
            <th>最近同步</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td className="mono">{item.local_path}</td>
              <td>{modeLabels[item.sync_mode]}</td>
              <td>
                {item.remotes.map((remote, index) => (
                  <div key={`${item.id}-${remote.remoteId}`} className="table__inline">
                    <div>
                      {remote.displayName}（{roleLabels[remote.role] ?? remote.role}）· 顺序 {index + 1}
                    </div>
                    <div className="muted">
                      目录：{remote.remoteBasePath || '/'} · 可用：{formatGigabytes(remote.availableCapacityBytes)}
                    </div>
                  </div>
                ))}
              </td>
              <td>
                <span className={`badge badge--${item.status}`}>{statusLabels[item.status]}</span>
              </td>
              <td>{formatDate(item.last_sync_at)}</td>
              <td>
                <div className="table__actions">
                  <button onClick={() => onEdit(item)} disabled={pendingTaskId === item.id}>
                    编辑
                  </button>
                  <button onClick={() => onRunSync(item)} disabled={pendingTaskId === item.id || item.status === 'deleted'}>
                    {pendingTaskId === item.id ? '同步中...' : '手动同步'}
                  </button>
                  <button onClick={() => onToggleActive(item)} disabled={pendingTaskId === item.id || item.status === 'deleted'}>
                    {item.status === 'active' ? '停用' : '启用'}
                  </button>
                  <button onClick={() => onDelete(item)} disabled={pendingTaskId === item.id || item.status === 'deleted'}>
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
