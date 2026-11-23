import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

const adminResolveReportSchema = z.object({
  action: z.enum(['archive', 'warn_user', 'cancel_item', 'suspend_user']),
  resolutionNote: z.string().min(1).max(1000).transform(s => s.trim()).pipe(z.string().min(1)),
});

export function validateAdminResolveReport(req: Request, res: Response, next: NextFunction): void {
  const result = adminResolveReportSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request body', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
