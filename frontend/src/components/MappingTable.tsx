import { formatBytes, formatDate } from '../lib/format';
import type { MappingTaskListResponse } from '../lib/types';

type MappingTableProps = {
  items: MappingTaskListResponse['items'];
};

export function MappingTable({ items }: MappingTableProps) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Local Path</th>
            <th>Mode</th>
            <th>Remotes</th>
            <th>Status</th>
            <th>Last Sync</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td className="mono">{item.local_path}</td>
              <td>{item.sync_mode}</td>
              <td>
                {item.remotes.map((remote) => (
                  <div key={`${item.id}-${remote.remote_id}`} className="table__inline">
                    {remote.display_name} ({remote.role}) · {formatBytes(remote.available_capacity_bytes)}
                  </div>
                ))}
              </td>
              <td>
                <span className={`badge badge--${item.status}`}>{item.status}</span>
              </td>
              <td>{formatDate(item.last_sync_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
