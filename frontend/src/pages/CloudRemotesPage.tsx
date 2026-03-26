import { useQuery } from '@tanstack/react-query';
import { RemoteCard } from '../components/RemoteCard';
import { fetchCloudRemotes } from '../lib/api';

export function CloudRemotesPage() {
  const query = useQuery({
    queryKey: ['cloud-remotes'],
    queryFn: fetchCloudRemotes,
    refetchInterval: 10000
  });

  return (
    <div className="page">
      <header className="page__header">
        <h1>Cloud Remotes</h1>
        <button onClick={() => query.refetch()}>Refresh</button>
      </header>
      {query.isLoading ? <p>Loading cloud remotes...</p> : null}
      {query.error ? <p className="error">Failed to load cloud remotes.</p> : null}

      <section className="cards-grid">
        {(query.data?.items ?? []).map((item) => (
          <RemoteCard
            key={item.id}
            name={item.displayName}
            healthStatus={item.healthStatus}
            usagePercent={item.capacity.usagePercent}
            usedCapacity={item.capacity.usedCapacityBytes}
            remainingCapacity={item.capacity.remainingCapacityBytes}
            warningFlag={item.capacity.alert}
          />
        ))}
      </section>
    </div>
  );
}
