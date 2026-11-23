import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';
import { REPORT_REASONS } from '../../domain/entities/report.entity';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const reportReasonSchema = z.enum(REPORT_REASONS);

export const createReportBodySchema = z.object({
  reportedEntityType: z.enum(['item', 'user']),
  reportedEntityId: z.string().regex(UUID_V4_REGEX, 'Invalid UUID v4'),
  reason: reportReasonSchema,
  description: z.string().trim().min(1).max(500).optional(),
  recaptchaToken: z.string().min(1).max(8192),
});

export type CreateReportBody = z.infer<typeof createReportBodySchema>;

export function validateCreateReportBody(req: Request, res: Response, next: NextFunction): void {
  const result = createReportBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request body', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
