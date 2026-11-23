import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('recaptcha-policy', () => {
  const originalMinScore = process.env['RECAPTCHA_MIN_SCORE'];
  const originalNodeEnv = process.env['NODE_ENV'];

  afterEach(() => {
    if (originalMinScore === undefined) {
      delete process.env['RECAPTCHA_MIN_SCORE'];
    } else {
      process.env['RECAPTCHA_MIN_SCORE'] = originalMinScore;
    }
    process.env['NODE_ENV'] = originalNodeEnv;
    vi.resetModules();
  });

  beforeEach(() => {
    vi.resetModules();
  });

  it('en test exige score >= 0.5 por defecto', async () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['RECAPTCHA_MIN_SCORE'];
    const { isRecaptchaPassed } = await import('../src/application/services/recaptcha-policy');

    expect(isRecaptchaPassed({ success: true, score: 0.5 })).toBe(true);
    expect(isRecaptchaPassed({ success: true, score: 0.49 })).toBe(false);
  });

  it('en development acepta score >= 0.3 por defecto', async () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['RECAPTCHA_MIN_SCORE'];
    const { isRecaptchaPassed } = await import('../src/application/services/recaptcha-policy');

    expect(isRecaptchaPassed({ success: true, score: 0.3 })).toBe(true);
    expect(isRecaptchaPassed({ success: true, score: 0.29 })).toBe(false);
  });

  it('respeta RECAPTCHA_MIN_SCORE del entorno', async () => {
    process.env['NODE_ENV'] = 'development';
    process.env['RECAPTCHA_MIN_SCORE'] = '0.2';
    const { isRecaptchaPassed } = await import('../src/application/services/recaptcha-policy');

    expect(isRecaptchaPassed({ success: true, score: 0.2 })).toBe(true);
    expect(isRecaptchaPassed({ success: true, score: 0.19 })).toBe(false);
  });
});
