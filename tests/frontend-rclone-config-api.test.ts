import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRcloneRemote, listRcloneConfigRemotes, setApiMode, testRcloneRemote } from '../frontend/src/lib/api.js';

function storage() { const values: Record<string, string> = {}; return { getItem: (k: string) => values[k] ?? null, setItem: (k: string, v: string) => { values[k] = v; } }; }

describe('frontend rclone config api', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', storage());
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [], online: true, item: {} }) })));
    setApiMode('live');
  });

  it('lists configured remotes and tests connectivity', async () => {
    await listRcloneConfigRemotes();
    await testRcloneRemote('demo remote');
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/rclone-config/remotes');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/rclone-config/remotes/demo%20remote/test', expect.objectContaining({ method: 'POST' }));
  });

  it('creates a remote using the controlled endpoint', async () => {
    await createRcloneRemote({ name: 'demo', type: 'memory', parameters: { description: 'test' } });
    expect(fetch).toHaveBeenCalledWith('/api/rclone-config/remotes', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'demo', type: 'memory', parameters: { description: 'test' } }) }));
  });
});
