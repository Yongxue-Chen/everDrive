import { z } from 'zod';
export const DataRecoveryQuerySchema = z.object({ query: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(200).default(200) });
export const RunDataRecoverySchema = z.object({ destinationPath: z.string().min(1).max(1024), query: z.string().max(512).optional().default(''), conflictStrategy: z.enum(['skip', 'overwrite']).default('skip') });
export type RunDataRecoveryInput = z.infer<typeof RunDataRecoverySchema>;
