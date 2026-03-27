import { useQuery } from '@tanstack/react-query';
import { JobStatusPanel } from '../components/JobStatusPanel';
import { RemoteCard } from '../components/RemoteCard';
import { StatusCard } from '../components/StatusCard';
import { fetchCloudView, fetchWorkspaceView } from '../lib/api';
import { formatGigabytes } from '../lib/format';

export function DashboardPage() {
  const workspaceQuery = useQuery({ queryKey: ['workspace-view'], queryFn: fetchWorkspaceView, refetchInterval: 10000 });
  const cloudQuery = useQuery({ queryKey: ['cloud-view'], queryFn: fetchCloudView, refetchInterval: 10000 });

  const workspaceCount = workspaceQuery.data?.items.length ?? 0;
  const warningRemotes = cloudQuery.data?.items.filter((item) => item.warning_flag).length ?? 0;
  const totalSize = workspaceQuery.data?.items.reduce((acc, item) => acc + Number(item.total_size), 0) ?? 0;

  return (
    <div className="page">
      <header className="page__header">
        <h1>详情看板</h1>
        <button onClick={() => Promise.all([workspaceQuery.refetch(), cloudQuery.refetch()])}>刷新数据</button>
      </header>

      <section className="status-grid">
        <StatusCard title="工作空间数" value={String(workspaceCount)} tone="neutral" meta="按映射任务聚合" />
        <StatusCard title="数据总量" value={formatGigabytes(totalSize)} tone="good" meta="本地已索引体积" />
        <StatusCard title="告警云盘" value={String(warningRemotes)} tone={warningRemotes ? 'warn' : 'good'} meta="容量或健康状态异常" />
      </section>

      <section className="cards-grid">
        {(cloudQuery.data?.items ?? []).map((item) => (
          <RemoteCard
            key={item.remote_id}
            name={item.remote_name}
            healthStatus={item.health_status}
            usagePercent={item.usage_percent}
            usedCapacity={item.used_capacity}
            remainingCapacity={item.remaining_capacity}
            warningFlag={item.warning_flag}
          />
        ))}
      </section>

      <JobStatusPanel
        items={workspaceQuery.data?.items ?? []}
        isLoading={workspaceQuery.isLoading}
        error={workspaceQuery.isError}
      />
    </div>
  );
}
