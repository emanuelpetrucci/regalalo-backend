import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const loginBodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(1024),
  recaptchaToken: z.string().min(1).max(8192),
});

export function validateLoginBody(req: Request, res: Response, next: NextFunction): void {
  const result = loginBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
