import { describe, it, expect } from 'vitest';
import {
  resolveStoragePublicUrl,
  resolveStoragePublicUrls,
} from '../src/infrastructure/storage/resolve-storage-public-url';

describe('resolveStoragePublicUrl', () => {
  it('returns absolute URLs unchanged', () => {
    const url = 'https://cdn.example.com/a.jpg';
    expect(resolveStoragePublicUrl(url)).toBe(url);
  });

  it('builds Supabase public URL when driver is supabase', () => {
    expect(resolveStoragePublicUrl('items/abc/photo.jpg')).toBe(
      'https://test.supabase.co/storage/v1/object/public/test-bucket/items/abc/photo.jpg',
    );
  });

  it('maps multiple paths', () => {
    expect(resolveStoragePublicUrls(['items/a.jpg', 'items/b.jpg'])).toEqual([
      'https://test.supabase.co/storage/v1/object/public/test-bucket/items/a.jpg',
      'https://test.supabase.co/storage/v1/object/public/test-bucket/items/b.jpg',
    ]);
  });
});
