import { useQuery } from '@tanstack/react-query';
import { MappingTable } from '../components/MappingTable';
import { fetchMappingTasks } from '../lib/api';

export function MappingTasksPage() {
  const query = useQuery({
    queryKey: ['mapping-tasks'],
    queryFn: fetchMappingTasks,
    refetchInterval: 10000
  });

  return (
    <div className="page">
      <header className="page__header">
        <h1>Mapping Tasks</h1>
        <button onClick={() => query.refetch()}>Refresh</button>
      </header>
      {query.isLoading ? <p>Loading mapping tasks...</p> : null}
      {query.error ? <p className="error">Failed to load mapping tasks.</p> : null}
      {query.data ? <MappingTable items={query.data.items} /> : null}
    </div>
  );
}
