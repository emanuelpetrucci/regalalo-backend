import '../registry';
import { z } from '../registry';
import { registerBodySchema } from '../../interfaces/validators/register.validator';
import { loginBodySchema } from '../../interfaces/validators/login.validator';
import { forgotPasswordBodySchema } from '../../interfaces/validators/forgot-password.validator';
import { resetPasswordBodySchema } from '../../interfaces/validators/reset-password.validator';

export const registerRequestSchema = registerBodySchema.openapi('RegisterRequest');
export const loginRequestSchema = loginBodySchema.openapi('LoginRequest');
export const forgotPasswordRequestSchema = forgotPasswordBodySchema.openapi('ForgotPasswordRequest');
export const resetPasswordRequestSchema = resetPasswordBodySchema.openapi('ResetPasswordRequest');

export const authUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    postalCode: z.string(),
    reputationScore: z.number().int(),
    totalReceived: z.number().int(),
    totalDonated: z.number().int(),
  })
  .openapi('AuthUser');

export const loginUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    reputationScore: z.number().int(),
  })
  .openapi('LoginUser');

export const authResponseSchema = z
  .object({
    token: z.string(),
    user: authUserSchema,
  })
  .openapi('AuthResponse');

export const loginResponseSchema = z
  .object({
    token: z.string(),
    user: loginUserSchema,
  })
  .openapi('LoginResponse');

export const messageResponseSchema = z.object({ message: z.string() }).openapi('MessageResponse');

export const verifyEmailQuerySchema = z
  .object({ token: z.string().min(1).max(256) })
  .openapi('VerifyEmailQuery');

export const emailNotVerifiedErrorSchema = z
  .object({ message: z.string(), code: z.literal('EMAIL_NOT_VERIFIED') })
  .openapi('EmailNotVerifiedError');
