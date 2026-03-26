import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app/create-app.js';

describe('health and readiness endpoints', () => {
  it('returns 200 from /health and includes dependency states', async () => {
    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => false
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
    expect(response.body.checks.mysql).toBe(true);
    expect(response.body.checks.rcloneRcd).toBe(false);
  });

  it('returns 200 from /ready only when db and rclone are both reachable', async () => {
    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready');
  });

  it('returns 503 from /ready when any dependency is down', async () => {
    const app = createApp({
      checkDb: async () => false,
      checkRclone: async () => true
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
  });
});
