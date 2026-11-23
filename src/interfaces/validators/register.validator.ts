import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';
import { personNameSchema, optionalPhoneSchema } from './person-name.schema';
import { preferredLanguageSchema } from './preferred-language.schema';

export const registerBodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  firstName: personNameSchema,
  lastName: personNameSchema,
  postalCode: z.string().min(1).max(10),
  phone: optionalPhoneSchema,
  recaptchaToken: z.string().min(1).max(8192),
  language: preferredLanguageSchema.optional(),
});

export function validateRegisterBody(req: Request, res: Response, next: NextFunction): void {
  const result = registerBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
