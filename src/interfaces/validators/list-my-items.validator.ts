import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const listMyItemsQuerySchema = z.object({
  status: z.enum(['active', 'reserved', 'completed', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function validateListMyItemsQuery(req: Request, res: Response, next: NextFunction): void {
  const result = listMyItemsQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
