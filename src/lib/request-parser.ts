import type { ZodIssue, ZodType } from 'zod';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';

type ParseOptions = {
  message?: string;
  statusCode?: number;
};

export function parseOrBadRequest<TSchema extends ZodType>(
  schema: TSchema,
  input: unknown,
  options?: ParseOptions
): ReturnType<TSchema['parse']> {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: options?.message ?? 'Invalid request payload',
        statusCode: options?.statusCode ?? 400,
        details: error.issues as ZodIssue[]
      });
    }
    throw error;
  }
}
