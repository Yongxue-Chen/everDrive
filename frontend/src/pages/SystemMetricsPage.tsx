import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { errorText } from '../components/feedback';
import { Callout, EmptyState, PageHeader } from '../components/ui';
import { fetchMappingTasks, fetchMetricsOverview } from '../lib/api';
import { formatDate, formatRelative } from '../lib/format';

export function SystemMetricsPage() {
  const query = useQuery({ queryKey: ['metrics'], queryFn: fetchMetricsOverview, refetchInterval: 10000 });
  const tasks = useQuery({ queryKey: ['mapping-tasks'], queryFn: fetchMappingTasks });
  const metrics = query.data?.metrics;
  const taskName = (id: string) => tasks.data?.items.find((task) => task.id === id)?.name ?? `#${id}`;

  return (
    <div className="page">
      <PageHeader
        title="系统状态"
        description="任务队列、同步成功率和近期失败情况。"
        actions={
          <button className="icon-button" aria-label="刷新" title="刷新" onClick={() => void query.refetch()}>
            <RefreshCw size={16} />
          </button>
        }
      />
      {query.error ? <Callout tone="bad">{errorText(query.error, '加载系统指标失败。')}</Callout> : null}
      {metrics ? (
        <>
          <section className="kpi-grid kpi-grid--5">
            <div className="kpi">
              <span className="kpi__label">队列长度</span>
              <b className="kpi__value">{metrics.queueLength}</b>
            </div>
            <div className="kpi">
              <span className="kpi__label">运行中任务</span>
              <b className="kpi__value">{metrics.runningTasks}</b>
            </div>
            <div className={`kpi ${metrics.failedTasks24h ? 'kpi--bad' : 'kpi--good'}`}>
              <span className="kpi__label">24 小时失败</span>
              <b className="kpi__value">{metrics.failedTasks24h}</b>
            </div>
            <div className={`kpi ${metrics.remoteCapacityNearLimitCount ? 'kpi--warn' : ''}`}>
              <span className="kpi__label">容量告警云盘</span>
              <b className="kpi__value">{metrics.remoteCapacityNearLimitCount}</b>
            </div>
            <div className={`kpi ${metrics.recentSyncSuccessRate < 90 ? 'kpi--warn' : 'kpi--good'}`}>
              <span className="kpi__label">近期同步成功率</span>
              <b className="kpi__value">{metrics.recentSyncSuccessRate}%</b>
            </div>
          </section>
          <section className="panel">
            <div className="panel__head">
              <h3>最近失败任务</h3>
            </div>
            {metrics.recentFailedJobs.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>映射</th>
                      <th>类型</th>
                      <th>错误</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.recentFailedJobs.map((job) => (
                      <tr key={job.jobId}>
                        <td title={formatDate(job.createdAt)}>{formatRelative(job.createdAt)}</td>
                        <td>{taskName(job.mappingTaskId)}</td>
                        <td className="mono">{job.jobType}</td>
                        <td className="text-bad cell-wrap">{job.errorMessage ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="最近没有失败任务" />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
