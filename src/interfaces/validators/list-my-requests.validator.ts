import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const listMyRequestsQuerySchema = z.object({
  status: z.enum(['pending', 'selected', 'rejected', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function validateListMyRequestsQuery(req: Request, res: Response, next: NextFunction): void {
  const result = listMyRequestsQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
