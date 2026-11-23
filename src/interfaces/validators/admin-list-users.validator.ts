import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const adminListUsersQuerySchema = z.object({
  search: z.string().max(200).optional().transform(val => val?.trim() || undefined),
  status: z.enum(['active', 'suspended']).optional(),
  emailVerified: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      return val.toLowerCase() === 'true';
    }),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function validateAdminListUsers(req: Request, res: Response, next: NextFunction): void {
  const result = adminListUsersQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
