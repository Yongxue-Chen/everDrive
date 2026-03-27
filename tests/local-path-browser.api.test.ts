import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app/create-app.js';
import { createLocalPathRouter } from '../src/modules/local-path/local-path.controller.js';
import { LocalPathService } from '../src/modules/local-path/local-path.service.js';

describe('local path browser API', () => {
  let rootDir: string;
  let nestedDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'everdrive-path-browser-'));
    nestedDir = path.join(rootDir, 'photos');
    await fs.mkdir(nestedDir);
    await fs.writeFile(path.join(rootDir, 'ignore.txt'), 'x');
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('lists child directories under an allowed root', async () => {
    const localPathService = new LocalPathService([rootDir]);
    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true,
      localPathRouter: createLocalPathRouter(localPathService)
    });

    const response = await request(app).get('/api/local-paths').query({
      path: rootDir
    });

    expect(response.status).toBe(200);
    expect(response.body.currentPath).toBe(rootDir);
    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'photos',
          path: nestedDir,
          isDirectory: true
        })
      ])
    );
  });

  it('allows browsing the system root directory when root is allowed', async () => {
    const localPathService = new LocalPathService(['/']);
    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true,
      localPathRouter: createLocalPathRouter(localPathService)
    });

    const response = await request(app).get('/api/local-paths').query({
      path: '/'
    });

    expect(response.status).toBe(200);
    expect(response.body.currentPath).toBe('/');
    expect(response.body.parentPath).toBeNull();
    expect(Array.isArray(response.body.items)).toBe(true);
  });

  it('rejects paths outside the allowed roots', async () => {
    const localPathService = new LocalPathService([rootDir]);
    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true,
      localPathRouter: createLocalPathRouter(localPathService)
    });

    const response = await request(app).get('/api/local-paths').query({
      path: '/'
    });

    expect(response.status).toBe(400);
  });
});
