import { describe, expect, it } from 'vitest';
import { createCorsOptions, isAllowedCorsOrigin } from '../src/config/cors';

describe('isAllowedCorsOrigin', () => {
  const primary = 'https://regalalo.org';
  const extras = ['http://localhost:4201'];

  it('allows primary origin', () => {
    expect(isAllowedCorsOrigin(primary, primary, extras, false)).toBe(true);
  });

  it('allows extra origins', () => {
    expect(isAllowedCorsOrigin('http://localhost:4201', primary, extras, false)).toBe(
      true,
    );
  });

  it('blocks unknown origins when vercel previews disabled', () => {
    expect(
      isAllowedCorsOrigin(
        'https://regalalo-git-main-team.vercel.app',
        primary,
        extras,
        false,
      ),
    ).toBe(false);
  });

  it('allows vercel preview origins when enabled', () => {
    expect(
      isAllowedCorsOrigin(
        'https://regalalo-git-develop-ecabralpetrucci-4426s-projects.vercel.app',
        primary,
        extras,
        true,
      ),
    ).toBe(true);
    expect(
      isAllowedCorsOrigin(
        'https://regalalo-git-main-team.vercel.app',
        primary,
        extras,
        true,
      ),
    ).toBe(true);
    expect(
      isAllowedCorsOrigin('https://regalalo-abc123.vercel.app', primary, extras, true),
    ).toBe(true);
  });
});

describe('createCorsOptions', () => {
  it('accepts requests without Origin header', async () => {
    const options = createCorsOptions({
      primaryOrigin: 'https://regalalo.org',
      extraOrigins: [],
      allowVercelPreviews: false,
    });

    await new Promise<void>((resolve, reject) => {
      options.origin?.(undefined, (error, allowed) => {
        try {
          expect(error).toBeNull();
          expect(allowed).toBe(true);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  it('rejects disallowed origins', async () => {
    const options = createCorsOptions({
      primaryOrigin: 'https://regalalo.org',
      extraOrigins: [],
      allowVercelPreviews: false,
    });

    await new Promise<void>((resolve, reject) => {
      options.origin?.('https://evil.example', (error, allowed) => {
        try {
          expect(error).toBeNull();
          expect(allowed).toBe(false);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });
});
