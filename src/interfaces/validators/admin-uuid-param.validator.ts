import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

const adminUuidParamSchema = z.object({
  id: z.string().uuid(),
});

export function validateAdminUuidParam(req: Request, res: Response, next: NextFunction): void {
  const result = adminUuidParamSchema.safeParse(req.params);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  next();
}
