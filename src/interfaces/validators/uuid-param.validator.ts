import { Request, Response, NextFunction } from 'express';
import { UUID_V4_REGEX } from '../../domain/uuid';

export function validateUuidParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    if (typeof value !== 'string' || !UUID_V4_REGEX.test(value)) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }
    next();
  };
}
