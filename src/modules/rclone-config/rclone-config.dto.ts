import { z } from 'zod';
import { AppError } from '../../errors/app-error.js';

const RemoteNameSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._ -]*$/);
const ConfigValueSchema = z.union([z.string(), z.number().finite(), z.boolean()]);
const ParametersSchema = z.record(z.string().min(1), ConfigValueSchema);

export const CreateRcloneRemoteSchema = z.object({
  name: RemoteNameSchema,
  type: z.string().trim().min(1).max(128),
  parameters: ParametersSchema.default({})
});

export const UpdateRcloneRemoteSchema = z.object({ parameters: ParametersSchema }).strict();

export function parseRcloneRemoteName(raw: string): string {
  const result = RemoteNameSchema.safeParse(raw);
  if (!result.success) {
    throw new AppError({ code: 'BAD_REQUEST', message: `Invalid rclone remote name: ${raw}`, statusCode: 400 });
  }
  return result.data;
}
