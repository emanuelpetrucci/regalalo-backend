import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';
import { itemCategorySchema, itemWeightRangeSchema } from '../../openapi/schemas/common.schemas';

export const publishItemBodySchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  condition: z.enum(['new', 'like_new', 'good', 'fair']),
  postalCode: z.string().min(1).max(10),
  category: itemCategorySchema,
  weightRange: itemWeightRangeSchema,
});

export function validatePublishItemBody(req: Request, res: Response, next: NextFunction): void {
  const result = publishItemBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
