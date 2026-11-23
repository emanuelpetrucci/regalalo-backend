import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const forgotPasswordBodySchema = z.object({
  email: z.string().email().max(255),
});

export function validateForgotPasswordBody(req: Request, res: Response, next: NextFunction): void {
  const result = forgotPasswordBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
