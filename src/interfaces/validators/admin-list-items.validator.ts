import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const adminListItemsQuerySchema = z.object({
  search: z.string().max(200).optional().transform(val => val?.trim() || undefined),
  status: z.enum(['active', 'reserved', 'completed', 'cancelled']).optional(),
  category: z
    .enum(['furniture', 'electronics', 'clothing', 'books', 'toys', 'kitchen', 'sports', 'tools', 'other'])
    .optional(),
  degraded: z.coerce.boolean().optional(),
  donorId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function validateAdminListItems(req: Request, res: Response, next: NextFunction): void {
  const result = adminListItemsQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
