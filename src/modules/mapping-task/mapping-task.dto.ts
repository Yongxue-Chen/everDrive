import { z } from 'zod';
import { AppError } from '../../errors/app-error.js';

const bigintInputSchema = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative(), z.bigint()]);

const mappingRemoteBindingSchema = z.object({
  remoteId: bigintInputSchema,
  priority: z.number().int().positive().max(1_000_000).optional(),
  remoteBasePath: z.string().max(512).optional()
});

export const CreateMappingTaskSchema = z.object({
  name: z.string().min(1),
  localPath: z.string().optional(),
  sourceType: z.enum(['local','rclone']).default('local'),
  sourceRemoteName: z.string().max(128).nullable().optional(),
  sourcePath: z.string().max(512).optional(),
  syncMode: z.enum(['archive', 'mirror']),
  encryptionEnabled: z.boolean().default(false),
  redundancyEnabled: z.boolean().default(false),
  splitEnabled: z.boolean().default(false),
  expectedDataSizeBytes: bigintInputSchema.optional(),
  remoteBindings: z.array(mappingRemoteBindingSchema).min(1)
});

export const UpdateMappingTaskSchema = z
  .object({
    name: z.string().min(1).optional(),
    localPath: z.string().optional(),
    sourceType: z.enum(['local','rclone']).optional(),
    sourceRemoteName: z.string().max(128).nullable().optional(),
    sourcePath: z.string().max(512).optional(),
    syncMode: z.enum(['archive', 'mirror']).optional(),
    encryptionEnabled: z.boolean().optional(),
    redundancyEnabled: z.boolean().optional(),
    splitEnabled: z.boolean().optional(),
    expectedDataSizeBytes: bigintInputSchema.optional(),
    remoteBindings: z.array(mappingRemoteBindingSchema).min(1).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });

export const MappingTaskListQuerySchema = z.object({
  status: z.enum(['active', 'inactive', 'deleted', 'all']).optional(),
  includeDeleted: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean' || value === undefined) {
        return value;
      }
      return value === 'true';
    })
});

export const SetTaskActiveSchema = z.object({
  isActive: z.boolean()
});

export const DeleteTaskQuerySchema = z.object({
  hardDelete: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean' || value === undefined) {
        return value;
      }
      return value === 'true';
    })
});

export function parseTaskId(rawId: string): bigint {
  if (!/^\d+$/.test(rawId)) {
    throw new AppError({
      code: 'BAD_REQUEST',
      message: `Invalid mapping task id: ${rawId}`,
      statusCode: 400
    });
  }

  return BigInt(rawId);
}

export function toBigInt(value: string | number | bigint | undefined): bigint | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  return BigInt(value);
}
