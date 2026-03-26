import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1),

  RCLONE_RCD_URL: z.string().url(),
  RCLONE_RCD_USER: z.string().min(1),
  RCLONE_RCD_PASS: z.string().min(1),
  RCLONE_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  RCLONE_RETRY_ATTEMPTS: z.coerce.number().int().min(0).default(2),
  RCLONE_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(250),

  SCAN_BATCH_SIZE: z.coerce.number().int().positive().default(1000),
  SCAN_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),

  SYNC_CONCURRENCY: z.coerce.number().int().positive().default(4),
  RCLONE_CONCURRENCY: z.coerce.number().int().positive().default(4),
  JOB_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  JOB_SHORT_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  JOB_REMOTE_CONCURRENCY_LIMIT: z.coerce.number().int().positive().default(1)
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  return EnvSchema.parse(input);
}

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = parseEnv(process.env);
  }
  return cachedEnv;
}
