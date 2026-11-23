import { UUID_V4_REGEX } from './uuid';

const SLUG_MAX_LENGTH = 60;

/**
 * Base del slug, sin sufijo de colisión.
 * `item_slug_base` en `027-items-slug-realign.sql` replica esta misma regla,
 * incluido el prefijo `item-` cuando la base es un UUID v4.
 */
export function slugBase(title: string): string {
  const ascii = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const trimmed = ascii.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, '');
  const base = trimmed === '' ? 'item' : trimmed;
  if (!UUID_V4_REGEX.test(base)) return base;

  const prefixed = `item-${base}`.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, '');
  return prefixed === '' ? 'item' : prefixed;
}

/** El primero conserva la base. El siguiente es `base-2`, luego `base-3`. */
export function allocateSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
