import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const requestItemBodySchema = z.object({
  contactChannel: z.string().trim().min(1).max(500),
});

export function validateRequestItemBody(req: Request, res: Response, next: NextFunction): void {
  const result = requestItemBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request body', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
