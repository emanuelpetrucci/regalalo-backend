import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const adminLoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

export function validateAdminLoginBody(req: Request, res: Response, next: NextFunction): void {
  const result = adminLoginBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
