import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const pauseItemBodySchema = z.object({
  paused: z.boolean(),
});

export function validatePauseItemBody(req: Request, res: Response, next: NextFunction): void {
  const result = pauseItemBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request body', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
