import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../../config/env';
import { logger } from '../../../infrastructure/logging/logger';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { UnprocessableEntityException } from '../../../domain/exceptions/unprocessable-entity.exception';
import { GeocodingException } from '../../../domain/exceptions/geocoding.exception';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { EmailNotVerifiedException } from '../../../domain/exceptions/email-not-verified.exception';
import { StorageException } from '../../../domain/exceptions/storage.exception';
import { ResendCooldownException } from '../../../domain/exceptions/resend-cooldown.exception';
import { AdminAuthException } from '../../../domain/exceptions/admin-auth.exception';
import { TooManyRequestsException } from '../../../domain/exceptions/too-many-requests.exception';
import { GoneException } from '../../../domain/exceptions/gone.exception';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof AdminAuthException) {
    res.status(401).json({ code: err.code, message: err.message });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({ message: err.message });
    return;
  }
  if (err instanceof BadRequestException) {
    res.status(400).json({ message: err.message });
    return;
  }
  if (err instanceof ResendCooldownException) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
    res.status(429).json({ message: err.message });
    return;
  }
  if (err instanceof TooManyRequestsException) {
    if (err.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
    }
    res.status(429).json({ message: err.message });
    return;
  }
  if (err instanceof ConflictException) {
    res.status(409).json({ message: err.message });
    return;
  }
  if (err instanceof UnprocessableEntityException) {
    res.status(422).json({ message: err.message });
    return;
  }
  if (err instanceof GeocodingException) {
    res.status(400).json({ message: err.message });
    return;
  }
  if (err instanceof EmailNotVerifiedException) {
    res.status(403).json({ message: err.message, code: err.code });
    return;
  }
  if (err instanceof ForbiddenException) {
    res.status(403).json({ message: err.message });
    return;
  }
  if (err instanceof GoneException) {
    res.status(410).json({ message: err.message });
    return;
  }
  if (err instanceof NotFoundException) {
    res.status(404).json({ message: err.message });
    return;
  }
  if (err instanceof UnauthorizedException) {
    res.status(401).json({ message: err.message });
    return;
  }
  if (err instanceof StorageException) {
    const message =
      env.NODE_ENV === 'development'
        ? err.message
        : 'No se pudo guardar la imagen. Inténtalo de nuevo más tarde.';
    res.status(503).json({ message });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ message: 'Internal server error' });
}
