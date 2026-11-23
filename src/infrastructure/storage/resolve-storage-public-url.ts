import { env } from '../../config/env';

/** Convierte `storage_path` de BD en URL pública consumible por `<img src>`. */
export function resolveStoragePublicUrl(storagePath: string): string {
  if (/^https?:\/\//i.test(storagePath)) {
    return storagePath;
  }

  const normalized = storagePath.replace(/^\/+/, '');

  if (env.STORAGE_DRIVER === 'local') {
    const apiBase = (process.env['API_PUBLIC_URL'] ?? `http://localhost:${env.PORT}`).replace(
      /\/$/,
      '',
    );
    return `${apiBase}/api/storage/${normalized}`;
  }

  const supabaseBase = env.SUPABASE_URL.replace(/\/$/, '');
  const encodedPath = normalized.split('/').map(encodeURIComponent).join('/');
  return `${supabaseBase}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/${encodedPath}`;
}

export function resolveStoragePublicUrls(paths: string[]): string[] {
  return paths.map(resolveStoragePublicUrl);
}
