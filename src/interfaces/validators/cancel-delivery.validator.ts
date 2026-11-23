import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const cancelDeliveryBodySchema = z.object({
  noShow: z.boolean(),
});

export function validateCancelDeliveryBody(req: Request, res: Response, next: NextFunction): void {
  const result = cancelDeliveryBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request body', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
