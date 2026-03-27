import { z } from 'zod';

export const BrowseLocalPathQuerySchema = z.object({
  path: z.string().min(1).optional()
});
