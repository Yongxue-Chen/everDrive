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
});
