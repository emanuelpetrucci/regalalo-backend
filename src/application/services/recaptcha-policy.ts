import { env } from '../../config/env';

function defaultMinScore(): number {
  if (env.NODE_ENV === 'production' || env.NODE_ENV === 'test') {
    return 0.5;
  }
  // En desarrollo, incógnito y perfiles sin historial suelen obtener score < 0.5.
  return 0.3;
}

function parseRecaptchaMinScore(): number {
  const raw = process.env['RECAPTCHA_MIN_SCORE'];
  if (raw === undefined || raw.trim() === '') {
    return defaultMinScore();
  }
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error('RECAPTCHA_MIN_SCORE must be a number between 0 and 1');
  }
  return n;
}

export const recaptchaMinScore = parseRecaptchaMinScore();

export function isRecaptchaPassed(result: { success: boolean; score: number }): boolean {
  return result.success && result.score >= recaptchaMinScore;
}
