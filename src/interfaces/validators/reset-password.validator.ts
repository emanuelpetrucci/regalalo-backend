import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(128),
});

export function validateResetPasswordBody(req: Request, res: Response, next: NextFunction): void {
  const result = resetPasswordBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
