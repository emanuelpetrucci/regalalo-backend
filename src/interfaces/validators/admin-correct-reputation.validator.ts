import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const adminCorrectReputationBodySchema = z.object({
  delta: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((v) => v !== 0, { message: 'delta no puede ser cero' }),
  reason: z.string().min(1).max(500),
});

export function validateAdminCorrectReputation(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const result = adminCorrectReputationBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
