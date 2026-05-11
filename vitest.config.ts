import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'fatal',
      DATABASE_URL: 'mysql://everdrive:test@127.0.0.1:3306/everdrive_test',
      RCLONE_RCD_URL: 'http://127.0.0.1:5572',
      RCLONE_RCD_USER: 'test',
      RCLONE_RCD_PASS: 'test'
    }
  }
});
