import { env } from '../../config/env';

/** Extrae `storage_path` relativo desde una URL pública de avatar (inverso de `resolveStoragePublicUrl`). */
export function extractStoragePathFromPublicUrl(url: string): string | null {
  if (!/^https?:\/\//i.test(url)) {
    if (!url.includes('://')) {
      const path = url.replace(/^\/+/, '').split('?')[0].split('#')[0];
      if (path.includes('..') || path.startsWith('/')) return null;
      return path;
    }
    return null;
  }

  const cleanUrl = url.split('?')[0].split('#')[0];

  const localMatch = cleanUrl.match(/\/api\/storage\/(.+)$/);
  if (localMatch?.[1]) {
    const path = decodeURIComponent(localMatch[1]);
    if (path.includes('..') || path.startsWith('/')) return null;
    return path;
  }

  const supabaseBase = env.SUPABASE_URL.replace(/\/$/, '');
  const prefix = `${supabaseBase}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/`;
  if (cleanUrl.startsWith(prefix)) {
    const encodedPath = cleanUrl.slice(prefix.length);
    const path = encodedPath.split('/').map(decodeURIComponent).join('/');
    if (path.includes('..') || path.startsWith('/')) return null;
    return path;
  }

  return null;
}
