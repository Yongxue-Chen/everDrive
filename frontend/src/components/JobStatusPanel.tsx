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

  return (
    <section className={`panel panel--${tone}`}>
      <div className="panel__head">
        <h3>JobStatusPanel</h3>
        <div className="panel__actions">
          <input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="Job ID" />
          <button onClick={() => setSubmittedId(jobId)}>Track</button>
        </div>
      </div>
      {query.isLoading ? <p>Loading...</p> : null}
      {query.error ? <p className="error">Failed to fetch job.</p> : null}
      {query.data ? (
        <div className="job-grid">
          <p>
            <strong>ID:</strong> {query.data.id}
          </p>
          <p>
            <strong>Kind:</strong> {query.data.kind}
          </p>
          <p>
            <strong>Status:</strong> {query.data.status}
          </p>
          <p>
            <strong>Started:</strong> {formatDate(query.data.startedAt)}
          </p>
          <p>
            <strong>Finished:</strong> {formatDate(query.data.finishedAt)}
          </p>
          <p>
            <strong>Error:</strong> {query.data.errorMessage ?? '-'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
