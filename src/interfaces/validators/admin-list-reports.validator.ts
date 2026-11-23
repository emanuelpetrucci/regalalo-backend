import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

function emptyStrToUndefined(v: unknown) {
  return v === '' ? undefined : v;
}

const adminListReportsSchema = z.object({
  status: z.preprocess(emptyStrToUndefined, z.enum(['pending', 'resolved', 'archived']).optional().default('pending')),
  reportedEntityType: z.enum(['item', 'user']).optional(),
  reason: z.enum([
    'contenido_inadecuado',
    'fraude_o_enganio',
    'spam',
    'objeto_ilegal',
    'objeto_peligroso',
    'información_falsa',
    'comportamiento_abusivo',
    'otro',
  ]).optional(),
  dateFrom: z.string().datetime({ offset: true }).transform(v => new Date(v)).optional(),
  dateTo: z.string().datetime({ offset: true }).transform(v => new Date(v)).optional(),
  page: z.preprocess(emptyStrToUndefined, z.coerce.number().int().min(1).optional().default(1)),
  limit: z.preprocess(emptyStrToUndefined, z.coerce.number().int().min(1).max(100).optional().default(20)),
});

export function validateAdminListReports(req: Request, res: Response, next: NextFunction): void {
  const result = adminListReportsSchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
