import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

const coerceBoolean = z.preprocess(
  v => {
    if (v === '' || v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
    return v;
  },
  z.boolean(),
);

export const adminListSessionsQuerySchema = z
  .object({
    status: z.enum(['active', 'completed', 'cancelled', 'expired']).optional(),
    overdue: coerceBoolean.optional(),
    userId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    data => !(data.overdue === true && data.status !== undefined && data.status !== 'active'),
    { message: 'overdue=true solo aplica a sesiones activas; no puede combinarse con status distinto de active', path: ['overdue'] },
  );

export function validateAdminListSessions(req: Request, res: Response, next: NextFunction): void {
  const result = adminListSessionsQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
