import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const adminVerifyOtpBodySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d{6}$/),
});

export function validateAdminVerifyOtpBody(req: Request, res: Response, next: NextFunction): void {
  const result = adminVerifyOtpBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
