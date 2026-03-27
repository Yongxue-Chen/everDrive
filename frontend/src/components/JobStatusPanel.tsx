import { buildRecentSyncSummaries } from '../lib/dashboard-activity';
import type { WorkspaceItem } from '../lib/types';

type JobStatusPanelProps = {
  items: WorkspaceItem[];
  isLoading?: boolean;
  error?: boolean;
};

export function JobStatusPanel({ items, isLoading = false, error = false }: JobStatusPanelProps) {
  const summaries = buildRecentSyncSummaries(items);

  return (
    <section className="panel panel--neutral">
      <div className="panel__head">
        <h3>最近同步活动</h3>
      </div>
      {isLoading ? <p>正在加载同步状态...</p> : null}
      {error ? <p className="error">获取最近同步状态失败。</p> : null}
      {!isLoading && !error && summaries.length === 0 ? <p className="muted">还没有可展示的映射同步记录。</p> : null}
      {!isLoading && !error && summaries.length > 0 ? (
        <div className="job-grid">
          {summaries.map((item) => (
            <div key={item.mappingTaskId}>
              <p>
                <strong>映射：</strong> {item.name}
              </p>
              <p>
                <strong>状态：</strong> {item.statusLabel}
              </p>
              <p>
                <strong>说明：</strong> {item.detail}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
