import { Request, Response, NextFunction } from 'express';
import { UUID_V4_REGEX } from '../../domain/uuid';

export const ITEM_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_SHAPE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_KEY_MAX_LENGTH = 100;

export function validateItemKeyParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    if (typeof value !== 'string' || value.length > ITEM_KEY_MAX_LENGTH) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }
    if (UUID_V4_REGEX.test(value)) {
      next();
      return;
    }
    if (UUID_SHAPE_REGEX.test(value) || !ITEM_SLUG_REGEX.test(value)) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }
    next();
  };
}
