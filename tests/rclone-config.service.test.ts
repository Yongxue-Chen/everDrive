import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { IRcloneConfigClient } from '../src/infrastructure/rclone/rclone-rcd-client.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import type { AuditService } from '../src/modules/audit/audit.service.js';
import { createRcloneConfigRouter } from '../src/modules/rclone-config/rclone-config.controller.js';
import { RcloneConfigService } from '../src/modules/rclone-config/rclone-config.service.js';

function createClient(overrides: Partial<IRcloneConfigClient> = {}): IRcloneConfigClient {
  return {
    listRemotes: vi.fn(async () => ['demo']),
    getConfigProviders: vi.fn(async () => ({ providers: [{ Name: 'memory', Description: 'Memory', Prefix: 'memory', Options: [] }] })),
    getRemoteConfig: vi.fn(async () => ({ type: 's3', access_key_id: 'visible', secret_access_key: 'secret', token: 'oauth-token' })),
    createRemoteConfig: vi.fn(async () => ({})),
    updateRemoteConfig: vi.fn(async () => ({})),
    deleteRemoteConfig: vi.fn(async () => undefined),
    testRemote: vi.fn(async () => true),
    ...overrides
  } as unknown as IRcloneConfigClient;
}

describe('RcloneConfigService', () => {
  it('masks sensitive configuration values', async () => {
    const service = new RcloneConfigService(createClient(), async () => null);
    await expect(service.getRemote('demo')).resolves.toEqual({
      name: 'demo',
      type: 's3',
      parameters: { access_key_id: 'visible', secret_access_key: '', token: '' },
      sensitiveFields: ['secret_access_key', 'token']
    });
  });

  it('prevents deleting a remote bound to everDrive', async () => {
    const client = createClient();
    const service = new RcloneConfigService(client, async () => ({ id: 4n, displayName: '主备份盘' }));
    await expect(service.deleteRemote('demo')).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    expect(client.deleteRemoteConfig).not.toHaveBeenCalled();
  });

  it('allows clearing ordinary fields while preserving blank sensitive fields', async () => {
    const client = createClient({
      getRemoteConfig: vi.fn(async () => ({ type: 's3', description: '', secret_access_key: 'secret' })),
      getConfigProviders: vi.fn(async () => ({ providers: [{ Prefix: 's3', Options: [{ Name: 'description', Sensitive: false }, { Name: 'secret_access_key', Sensitive: true }] }] }))
    });
    const service = new RcloneConfigService(client, async () => null);
    await service.updateRemote('demo', { description: '', secret_access_key: '' });
    expect(client.updateRemoteConfig).toHaveBeenCalledWith({ name: 'demo', parameters: { description: '' } });
  });

  it('returns only provider fields used by the frontend', async () => {
    const service = new RcloneConfigService(createClient({
      getConfigProviders: vi.fn(async () => ({ providers: [{
        Name: 'S3', Prefix: 's3', Description: 'S3 storage', Hide: false,
        MetadataInfo: { huge: true }, CommandHelp: [{ Name: 'restore' }],
        Options: [{ Name: 'provider', Help: 'Provider', Required: true, Sensitive: false, Type: 'string', DefaultStr: '', Examples: [{ Value: 'AWS', Help: 'Amazon' }], FieldName: 'Provider', Value: 'AWS' }]
      }] }))
    }), async () => null);
    await expect(service.listProviders()).resolves.toEqual({ providers: [{
      Name: 'S3', Prefix: 's3', Description: 'S3 storage', Hide: false,
      Options: [{ Name: 'provider', Help: 'Provider', Required: true, Sensitive: false, Type: 'string', DefaultStr: '', Examples: [{ Value: 'AWS', Help: 'Amazon' }] }]
    }] });
  });

  it('loads bound remotes in one query when listing rclone remotes', async () => {
    const lookup = vi.fn(async () => null);
    const listBound = vi.fn(async () => [{ id: 8n, remoteName: 'demo', displayName: '主备份盘' }]);
    const service = new RcloneConfigService(createClient({ listRemotes: vi.fn(async () => ['demo', 'archive']) }), lookup, listBound);
    await expect(service.listRemotes()).resolves.toEqual([
      { name: 'demo', boundRemoteId: '8', boundDisplayName: '主备份盘' },
      { name: 'archive', boundRemoteId: null, boundDisplayName: null }
    ]);
    expect(listBound).toHaveBeenCalledOnce();
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('rclone config api', () => {
  it('creates and tests a remote through validated endpoints', async () => {
    const client = createClient();
    const app = express();
    app.use(express.json());
    app.use(createRcloneConfigRouter(new RcloneConfigService(client, async () => null)));
    app.use(errorHandler);

    await request(app).post('/api/rclone-config/remotes').send({ name: 'demo_2', type: 'memory', parameters: { description: 'test' } }).expect(201);
    await request(app).post('/api/rclone-config/remotes/demo_2/test').expect(200, { online: true });
    expect(client.createRemoteConfig).toHaveBeenCalledWith({ name: 'demo_2', type: 'memory', parameters: { description: 'test' } });
  });

  it('rejects invalid remote names', async () => {
    const app = express();
    app.use(express.json());
    app.use(createRcloneConfigRouter(new RcloneConfigService(createClient(), async () => null)));
    app.use(errorHandler);

    await request(app).post('/api/rclone-config/remotes').send({ name: 'bad:name', type: 'memory', parameters: {} }).expect(400);
  });

  it('uses provider metadata to hide sensitive fields with ordinary names', async () => {
    const client = createClient({
      getRemoteConfig: vi.fn(async () => ({ type: 'custom', account: 'private-account', endpoint: 'https://example.test' })),
      getConfigProviders: vi.fn(async () => ({ providers: [{ Prefix: 'custom', Options: [{ Name: 'account', Sensitive: true }, { Name: 'endpoint', Sensitive: false }] }] }))
    });
    const service = new RcloneConfigService(client, async () => null);
    await expect(service.getRemote('demo')).resolves.toMatchObject({
      parameters: { account: '', endpoint: 'https://example.test' },
      sensitiveFields: ['account']
    });
  });

  it('audits remote configuration mutations without recording parameters', async () => {
    const client = createClient();
    const writeAudit = vi.fn(async (_input: Parameters<AuditService['write']>[0]) => undefined);
    const audit = { write: writeAudit } as unknown as AuditService;
    const app = express();
    app.use(express.json());
    app.use(createRcloneConfigRouter(new RcloneConfigService(client, async () => null), audit));
    app.use(errorHandler);

    await request(app).post('/api/rclone-config/remotes').send({ name: 'demo_2', type: 'memory', parameters: { token: 'secret' } }).expect(201);
    await request(app).patch('/api/rclone-config/remotes/demo_2').send({ parameters: { description: 'updated' } }).expect(200);
    await request(app).delete('/api/rclone-config/remotes/demo_2').expect(200);

    expect(writeAudit).toHaveBeenNthCalledWith(1, expect.objectContaining({ operationType: 'create', targetType: 'remote', metadataJson: { remoteName: 'demo_2', providerType: 'memory' } }));
    expect(writeAudit).toHaveBeenNthCalledWith(2, expect.objectContaining({ operationType: 'update', targetType: 'remote', metadataJson: { remoteName: 'demo_2' } }));
    expect(writeAudit).toHaveBeenNthCalledWith(3, expect.objectContaining({ operationType: 'delete', targetType: 'remote', metadataJson: { remoteName: 'demo_2' } }));
    const metadata = writeAudit.mock.calls.map(([input]) => input.metadataJson);
    expect(JSON.stringify(metadata)).not.toContain('secret');
    expect(JSON.stringify(metadata)).not.toContain('updated');
  });
});
