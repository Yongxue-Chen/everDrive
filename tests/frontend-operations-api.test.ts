import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAuditLogs, fetchMetricsOverview, fetchRedundancyOverview, retryFailedReplicas, startCloudMigration, setApiMode } from '../frontend/src/lib/api.js';

function storage() { const values: Record<string, string> = {}; return { getItem: (k: string) => values[k] ?? null, setItem: (k: string, v: string) => { values[k] = v; } }; }

describe('frontend operations api', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', storage());
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [], item: {}, metrics: {}, summary: {}, job: {} }) })));
    setApiMode('live');
  });

  it('submits cloud migration and redundancy recovery', async () => {
    await startCloudMigration('7', { sourceRemoteId: '1', targetRemoteId: '2', removeSourceReplica: false });
    await fetchRedundancyOverview('7');
    await retryFailedReplicas('7');
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/mapping-tasks/7/migration', expect.objectContaining({ method: 'POST' }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/mapping-tasks/7/redundancy');
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/mapping-tasks/7/redundancy/retry-failed', expect.objectContaining({ method: 'POST' }));
  });

  it('loads filtered logs and metrics', async () => {
    await fetchAuditLogs({ operationType: 'sync', limit: 50 });
    await fetchMetricsOverview();
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/audit/logs?operationType=sync&limit=50');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/metrics/overview');
  });
});
