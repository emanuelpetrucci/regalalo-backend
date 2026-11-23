import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const listMyDeliverySessionsQuerySchema = z.object({
  role: z.enum(['donor', 'receiver']).optional(),
  status: z.enum(['active', 'completed', 'cancelled', 'expired']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function validateListMyDeliverySessionsQuery(req: Request, res: Response, next: NextFunction): void {
  const result = listMyDeliverySessionsQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
