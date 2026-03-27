import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchJob } from '../lib/api';
import { formatDate } from '../lib/format';

export function JobStatusPanel() {
  const [jobId, setJobId] = useState('1001');
  const [submittedId, setSubmittedId] = useState('1001');

  const query = useQuery({
    queryKey: ['job-status', submittedId],
    queryFn: () => fetchJob(submittedId),
    refetchInterval: 3000
  });

  const tone = useMemo(() => {
    const status = query.data?.status;
    if (status === 'success') return 'good';
    if (status === 'failed' || status === 'cancelled') return 'bad';
    if (status === 'running') return 'warn';
    return 'neutral';
  }, [query.data?.status]);

  const statusLabel =
    query.data?.status === 'success'
      ? '成功'
      : query.data?.status === 'failed'
        ? '失败'
        : query.data?.status === 'cancelled'
          ? '已取消'
          : query.data?.status === 'running'
            ? '运行中'
            : query.data?.status === 'queued'
              ? '排队中'
              : '-';

  return (
    <section className={`panel panel--${tone}`}>
      <div className="panel__head">
        <h3>任务状态追踪</h3>
        <div className="panel__actions">
          <input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="任务 ID" />
          <button onClick={() => setSubmittedId(jobId)}>查询</button>
        </div>
      </div>
      {query.isLoading ? <p>正在加载任务状态...</p> : null}
      {query.error ? <p className="error">获取任务状态失败。</p> : null}
      {query.data ? (
        <div className="job-grid">
          <p>
            <strong>ID：</strong> {query.data.id}
          </p>
          <p>
            <strong>类型：</strong> {query.data.kind}
          </p>
          <p>
            <strong>状态：</strong> {statusLabel}
          </p>
          <p>
            <strong>开始时间：</strong> {formatDate(query.data.startedAt)}
          </p>
          <p>
            <strong>结束时间：</strong> {formatDate(query.data.finishedAt)}
          </p>
          <p>
            <strong>错误信息：</strong> {query.data.errorMessage ?? '-'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
