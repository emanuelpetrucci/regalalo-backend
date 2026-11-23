import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1).max(256),
});

export function validateVerifyEmailQuery(req: Request, res: Response, next: NextFunction): void {
  const result = verifyEmailQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
