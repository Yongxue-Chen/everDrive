import { useQueries } from '@tanstack/react-query';
import { Check, Loader2, X } from 'lucide-react';
import { useEffect } from 'react';
import { fetchJob } from '../lib/api';
import type { QueueJob } from '../lib/types';

const stageLabels: Record<string, string> = {
  scan: '扫描',
  rename_detect: '重命名检测',
  sync: '上传同步'
};

const finished = (status: QueueJob['status']) => status === 'success' || status === 'failed' || status === 'cancelled';

/** Polls the queued jobs of a manual sync and shows scan → rename → sync as stages. */
export function SyncProgress({ jobs, onDone }: { jobs: QueueJob[]; onDone: (failed: boolean) => void }) {
  const results = useQueries({
    queries: jobs.map((job) => ({
      queryKey: ['job', job.id],
      queryFn: () => fetchJob(job.id),
      initialData: job,
      refetchInterval: (query: { state: { data?: QueueJob } }) => (query.state.data && finished(query.state.data.status) ? false : 2000)
    }))
  });

  const current = results.map((result, index) => result.data ?? jobs[index]!);
  const allDone = current.every((job) => finished(job.status));
  const anyFailed = current.some((job) => job.status === 'failed' || job.status === 'cancelled');

  useEffect(() => {
    if (allDone) onDone(anyFailed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, anyFailed]);

  return (
    <ol className="sync-stages" aria-label="同步进度">
      {current.map((job) => (
        <li key={job.id} className={`sync-stage sync-stage--${job.status}`} title={job.errorMessage ?? undefined}>
          <span className="sync-stage__icon">
            {job.status === 'success' ? (
              <Check size={12} />
            ) : job.status === 'failed' || job.status === 'cancelled' ? (
              <X size={12} />
            ) : job.status === 'running' ? (
              <Loader2 size={12} className="spin" />
            ) : null}
          </span>
          {stageLabels[job.kind] ?? job.kind}
        </li>
      ))}
    </ol>
  );
}
