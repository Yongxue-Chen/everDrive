import { z } from 'zod';
import { AppError } from '../../errors/app-error.js';

const RemoteNameSchema = z.string().trim().min(1).max(128).regex(/^[^:\x00-\x1F\x7F]+$/u, 'Remote name cannot contain colons or control characters');
const ConfigValueSchema = z.union([z.string(), z.number().finite(), z.boolean()]);
const ParametersSchema = z.record(z.string().min(1), ConfigValueSchema);

export const CreateRcloneRemoteSchema = z.object({
  name: RemoteNameSchema,
  type: z.string().trim().min(1).max(128),
  parameters: ParametersSchema.default({})
});

export const UpdateRcloneRemoteSchema = z.object({ parameters: ParametersSchema }).strict();
export const UpdateRcloneRemoteMetadataSchema = z.object({ webUrl: z.union([z.string().trim().url().regex(/^https?:\/\//i).max(2048), z.literal(''), z.null()]) }).strict();
export const RcloneConfigFlowSchema = z.object({ action: z.enum(['create', 'update']), name: RemoteNameSchema, type: z.string().trim().min(1).max(128).optional(), parameters: ParametersSchema.default({}), state: z.string().max(8192).optional(), result: z.string().max(8192).optional() }).strict();

export function parseRcloneRemoteName(raw: string): string {
  const result = RemoteNameSchema.safeParse(raw);
  if (!result.success) {
    throw new AppError({ code: 'BAD_REQUEST', message: `Invalid rclone remote name: ${raw}`, statusCode: 400 });
  }
  return result.data;
}
