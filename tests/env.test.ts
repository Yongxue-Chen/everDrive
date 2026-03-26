import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

describe('parseEnv', () => {
  it('parses required environment variables and optional runtime knobs', () => {
    const parsed = parseEnv({
      NODE_ENV: 'development',
      PORT: '3200',
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'mysql://root:pass@localhost:3306/everdrive',
      RCLONE_RCD_URL: 'http://127.0.0.1:5572',
      RCLONE_RCD_USER: 'admin',
      RCLONE_RCD_PASS: 'secret',
      RCLONE_HTTP_TIMEOUT_MS: '8000',
      SCAN_BATCH_SIZE: '2000',
      SCAN_INTERVAL_SECONDS: '10',
      SYNC_CONCURRENCY: '8',
      RCLONE_CONCURRENCY: '6',
      JOB_WORKER_CONCURRENCY: '3'
    });

    expect(parsed.PORT).toBe(3200);
    expect(parsed.LOG_LEVEL).toBe('debug');
    expect(parsed.SCAN_BATCH_SIZE).toBe(2000);
    expect(parsed.SYNC_CONCURRENCY).toBe(8);
  });

  it('throws when required config is missing', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        PORT: '3000',
        LOG_LEVEL: 'info',
        RCLONE_RCD_URL: 'http://127.0.0.1:5572',
        RCLONE_RCD_USER: 'admin',
        RCLONE_RCD_PASS: 'secret'
      })
    ).toThrow();
  });
});
