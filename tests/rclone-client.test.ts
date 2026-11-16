import { afterEach, describe, expect, it, vi } from 'vitest';
import { RcloneClient } from '../src/infrastructure/rclone/rclone-rcd-client.js';

function createJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

describe('RcloneClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checks rcd online status by calling core/version', async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse(200, {
        version: 'v1.73.0'
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'everdrive',
      pass: '123456'
    });

    await expect(client.checkOnline()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5572/core/version',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('lists remotes from config/listremotes', async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse(200, {
        remotes: ['driveA:', 'driveB:']
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'everdrive',
      pass: '123456'
    });

    await expect(client.listRemotes()).resolves.toEqual(['driveA', 'driveB']);
  });

  it('loads remote capacity stats through operations/about', async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse(200, {
        total: 1000,
        used: 250,
        free: 750
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'everdrive',
      pass: '123456'
    });

    await expect(client.getAbout('driveA:')).resolves.toEqual({
      total: '1000',
      used: '250',
      free: '750'
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5572/operations/about',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns false when operations/stat reports no item', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(200, { item: null }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'everdrive',
      pass: '123456'
    });

    await expect(client.stat('driveA:', 'missing.txt')).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5572/operations/stat',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('retries transient network errors and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(createJsonResponse(200, {}));

    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'everdrive',
      pass: '123456',
      retryAttempts: 2,
      retryDelayMs: 1
    });

    const result = await client.copy({
      srcFs: '/data/source',
      srcRemote: '',
      dstFs: 'driveA:',
      dstRemote: 'backup'
    });

    expect(result.async).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:5572/operations/copyfile',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('maps authentication failures to AUTH_FAILED', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(401, { error: 'Unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'wrong',
      pass: 'wrong'
    });

    await expect(client.listRemotes()).rejects.toMatchObject({
      code: 'AUTH_FAILED'
    });
  });

  it('maps missing remote errors to REMOTE_NOT_FOUND', async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse(500, {
        error: "didn't find section in config file",
        status: 500
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'everdrive',
      pass: '123456'
    });

    await expect(client.copy({ srcFs: 'missingRemote:', srcRemote: '', dstFs: 'driveA:', dstRemote: '' })).rejects.toMatchObject({
      code: 'REMOTE_NOT_FOUND'
    });
  });

  it('maps network timeout to NETWORK_TIMEOUT', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchMock = vi.fn(async () => Promise.reject(abortError));
    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'everdrive',
      pass: '123456',
      timeoutMs: 1,
      retryAttempts: 0
    });

    await expect(client.sync({ srcFs: '/data/source', srcRemote: '', dstFs: 'driveA:', dstRemote: 'dir' })).rejects.toMatchObject({
      code: 'NETWORK_TIMEOUT'
    });
  });

  it('maps path conflict errors to PATH_CONFLICT', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(409, { error: 'file already exists', status: 409 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'everdrive',
      pass: '123456',
      retryAttempts: 0
    });

    await expect(client.move({ srcFs: '/data/source', srcRemote: '', dstFs: 'driveA:', dstRemote: 'dest' })).rejects.toMatchObject({
      code: 'PATH_CONFLICT'
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5572/operations/movefile',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('supports async operations and returns job id', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(200, { jobid: 42 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'everdrive',
      pass: '123456'
    });

    await expect(
      client.copy({
        srcFs: '/data/source',
        srcRemote: '',
        dstFs: 'driveA:',
        dstRemote: 'backup',
        async: true
      })
    ).resolves.toEqual({ async: true, jobId: 42 });
  });

  it('includes conservative execution profile in transfer calls', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'everdrive',
      pass: '123456',
      getExecutionProfile: () => ({
        transfers: 1,
        checkers: 1,
        bufferSizeMiB: 8,
        tpsLimit: 2,
        bwLimitMiB: 4
      })
    });

    await client.copy({
      srcFs: '/data/source',
      srcRemote: '',
      dstFs: 'driveA:',
      dstRemote: 'backup'
    });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    const body = JSON.parse((call?.[1].body as string) ?? '{}');
    expect(body._config).toMatchObject({
      Transfers: 1,
      Checkers: 1,
      BufferSize: 8 * 1024 * 1024,
      TPSLimit: 2,
      BwLimit: '4M'
    });
  });

  it('sends basic auth header for rclone requests', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(200, { remotes: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new RcloneClient({
      baseUrl: 'http://127.0.0.1:5572',
      user: 'everdrive',
      pass: '123456'
    });

    await client.listRemotes();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5572/config/listremotes',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic\s+/)
        })
      })
    );
  });

  it('manages remote configuration through fixed config endpoints', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(200, { type: 'memory' }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new RcloneClient({ baseUrl: 'http://127.0.0.1:5572', user: 'everdrive', pass: '123456' });

    await client.getRemoteConfig('demo');
    await client.createRemoteConfig({ name: 'demo', type: 'memory', parameters: { description: 'test' } });
    await client.updateRemoteConfig({ name: 'demo', parameters: { description: 'updated' } });
    await client.deleteRemoteConfig('demo');

    const calls = fetchMock.mock.calls.map((call) => (call as unknown as [string, RequestInit])[0]);
    expect(calls).toEqual([
      'http://127.0.0.1:5572/config/get',
      'http://127.0.0.1:5572/config/create',
      'http://127.0.0.1:5572/config/update',
      'http://127.0.0.1:5572/config/delete'
    ]);
    const createCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const createBody = JSON.parse(String(createCall[1].body));
    expect(createBody).toEqual({ name: 'demo', type: 'memory', parameters: { description: 'test' }, opt: { nonInteractive: true, obscure: true } });
  });

  it('tests remote connectivity with a one-item root listing', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(200, { list: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new RcloneClient({ baseUrl: 'http://127.0.0.1:5572', user: 'everdrive', pass: '123456' });

    await expect(client.testRemote('demo')).resolves.toBe(true);
    const testCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(testCall[1].body));
    expect(body).toEqual({ fs: 'demo:', remote: '', opt: { maxDepth: 1 }, _config: { MaxDepth: 1 } });
  });

  describe('deadlines by kind of call', () => {
    const options = { baseUrl: 'http://127.0.0.1:5572', user: 'everdrive', pass: '123456', timeoutMs: 20, remoteTimeoutMs: 200, longTimeoutMs: 600, retryAttempts: 2, retryDelayMs: 0 };

    /** A fetch that never answers until its deadline aborts it, recording how long each call was given. */
    function hangingFetch() {
      const waits: number[] = [];
      const fetchMock = vi.fn((_url: string, init: RequestInit) => {
        const startedAt = Date.now();
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            waits.push(Date.now() - startedAt);
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      return { fetchMock, waits };
    }

    it('gives a single remote round trip the remote deadline and does not repeat a timed-out call', async () => {
      const { fetchMock, waits } = hangingFetch();
      const client = new RcloneClient(options);

      await expect(client.listEntries('slow:', '')).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(waits[0]).toBeGreaterThanOrEqual(180);
      expect(waits[0]).toBeLessThan(500);

      await expect(client.getAbout('slow:')).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
      await expect(client.stat('slow:', 'a')).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
      await expect(client.testRemote('slow')).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(Math.min(...waits)).toBeGreaterThanOrEqual(180);
    });

    it('gives recursive listings and blocking transfers the long deadline', async () => {
      const { fetchMock, waits } = hangingFetch();
      const client = new RcloneClient(options);

      await expect(client.listEntries('slow:', '', true)).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
      await expect(client.sync({ srcFs: '/data', srcRemote: '', dstFs: 'slow:', dstRemote: 'd' })).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(Math.min(...waits)).toBeGreaterThanOrEqual(550);
    });

    it('keeps the short deadline, with retries, for the daemon and for calls that only queue a job', async () => {
      const { fetchMock, waits } = hangingFetch();
      const client = new RcloneClient(options);

      await expect(client.listRemotes()).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      await expect(client.sync({ srcFs: '/data', srcRemote: '', dstFs: 'slow:', dstRemote: 'd', async: true })).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
      expect(fetchMock).toHaveBeenCalledTimes(6);
      expect(Math.max(...waits)).toBeLessThan(150);
    });

    it('still retries a remote call when the daemon itself is unreachable', async () => {
      const fetchMock = vi.fn(async () => Promise.reject(new TypeError('fetch failed')));
      vi.stubGlobal('fetch', fetchMock);
      const client = new RcloneClient(options);

      await expect(client.getAbout('any:')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('never gives a remote less time than the daemon', async () => {
      const { waits } = hangingFetch();
      const client = new RcloneClient({ ...options, timeoutMs: 150, remoteTimeoutMs: 10, longTimeoutMs: 10, retryAttempts: 0 });

      await expect(client.getAbout('slow:')).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
      expect(waits[0]).toBeGreaterThanOrEqual(130);
    });
  });

});
