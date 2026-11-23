import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';
import { personNameSchema } from './person-name.schema';
import { preferredLanguageSchema } from './preferred-language.schema';

export const updateProfileBodySchema = z
  .object({
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional(),
    avatarUrl: z.string().url().nullable().optional(),
    phone: z.union([z.string().trim().min(1).max(20), z.null()]).optional(),
    postalCode: z.string().trim().min(1).max(10).optional(),
    preferredLanguage: preferredLanguageSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export function validateUpdateProfileBody(req: Request, res: Response, next: NextFunction): void {
  const result = updateProfileBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
