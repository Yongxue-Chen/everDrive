import { z } from 'zod';
import { AppError } from '../../errors/app-error.js';

const bigintInputSchema = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative(), z.bigint()]);

const remoteNameSchema = z.string().min(1).max(128);

export const CreateRemoteSchema = z.object({
  displayName: z.string().min(1).max(128),
  remoteName: remoteNameSchema,
  totalCapacity: bigintInputSchema.optional(),
  reservedCapacity: bigintInputSchema.optional(),
  warningThresholdPercent: z.number().int().min(1).max(100).optional(),
  cloudTrashEnabled: z.boolean().optional(),
  cloudTrashBasePath: z.string().min(1).max(512).optional(),
  remoteRootPath: z.string().max(512).optional()
});

export const UpdateRemoteSettingsSchema = z
  .object({
    displayName: z.string().min(1).max(128).optional(),
    remoteName: remoteNameSchema.optional(),
    totalCapacity: bigintInputSchema.optional(),
    reservedCapacity: bigintInputSchema.optional(),
    warningThresholdPercent: z.number().int().min(1).max(100).optional(),
    cloudTrashEnabled: z.boolean().optional(),
    cloudTrashBasePath: z.string().min(1).max(512).optional(),
    remoteRootPath: z.string().max(512).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one remote field is required'
  });

export const UpdateRemoteCapacitySchema = UpdateRemoteSettingsSchema;

export const UpdateRemoteActiveSchema = z.object({
  isActive: z.boolean()
});

export function parseRemoteId(rawId: string): bigint {
  if (!/^\d+$/.test(rawId)) {
    throw new AppError({
      code: 'BAD_REQUEST',
      message: `Invalid remote id: ${rawId}`,
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
