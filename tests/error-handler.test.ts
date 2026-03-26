import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app/create-app.js';

describe('error response standardization', () => {
  it('returns standardized not-found payload', async () => {
    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true
    });

    const response = await request(app).get('/non-exist-route');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).toContain('Route not found');
    expect(typeof response.body.error.requestId).toBe('string');
  });
});
