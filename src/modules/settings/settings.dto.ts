import { z } from 'zod';

export const LogLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']);
export const HashAlgorithmSchema = z.enum(['md5', 'sha1', 'sha256', 'blake3']);

export const SettingsSchema = z.object({
  rcloneRcd: z.object({
    url: z.string().url(),
    user: z.string().min(1),
    pass: z.string().min(1),
    timeoutMs: z.number().int().positive(),
    retryAttempts: z.number().int().min(0),
    retryDelayMs: z.number().int().min(0)
  }),
  defaultScanIntervalSeconds: z.number().int().positive(),
  defaultConcurrency: z.object({
    sync: z.number().int().positive(),
    rclone: z.number().int().positive(),
    jobLong: z.number().int().positive(),
    jobShort: z.number().int().positive(),
    jobRemoteLimit: z.number().int().positive()
  }),
  defaultCapacityWarningThresholdPercent: z.number().int().min(1).max(100),
  hashAlgorithm: HashAlgorithmSchema,
  logLevel: LogLevelSchema
});

export type Settings = z.infer<typeof SettingsSchema>;

export const UpdateSettingsSchema = z
  .object({
    rcloneRcd: z
      .object({
        url: z.string().url().optional(),
        user: z.string().min(1).optional(),
        pass: z.string().min(1).optional(),
        timeoutMs: z.number().int().positive().optional(),
        retryAttempts: z.number().int().min(0).optional(),
        retryDelayMs: z.number().int().min(0).optional()
      })
      .optional(),
    defaultScanIntervalSeconds: z.number().int().positive().optional(),
    defaultConcurrency: z
      .object({
        sync: z.number().int().positive().optional(),
        rclone: z.number().int().positive().optional(),
        jobLong: z.number().int().positive().optional(),
        jobShort: z.number().int().positive().optional(),
        jobRemoteLimit: z.number().int().positive().optional()
      })
      .optional(),
    defaultCapacityWarningThresholdPercent: z.number().int().min(1).max(100).optional(),
    hashAlgorithm: HashAlgorithmSchema.optional(),
    logLevel: LogLevelSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

export type SettingsView = {
  values: {
    rcloneRcd: {
      url: string;
      user: string;
      passMasked: string;
      hasPassword: boolean;
      timeoutMs: number;
      retryAttempts: number;
      retryDelayMs: number;
    };
    defaultScanIntervalSeconds: number;
    defaultConcurrency: {
      sync: number;
      rclone: number;
      jobLong: number;
      jobShort: number;
      jobRemoteLimit: number;
    };
    defaultCapacityWarningThresholdPercent: number;
    hashAlgorithm: 'md5' | 'sha1' | 'sha256' | 'blake3';
    logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  };
  hotUpdate: {
    hotUpdatedKeys: string[];
    restartRequiredKeys: string[];
    notes: string[];
  };
};
