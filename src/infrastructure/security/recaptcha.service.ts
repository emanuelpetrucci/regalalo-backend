import { env } from '../../config/env';
import { IRecaptchaService } from '../../application/services/recaptcha.service';
import { logger } from '../logging/logger';
import { DEV_RECAPTCHA_MOCK_TOKEN } from './recaptcha.constants';

export class RecaptchaService implements IRecaptchaService {
  async verify(token: string): Promise<{ success: boolean; score: number }> {
    if (env.NODE_ENV !== 'production' && token === DEV_RECAPTCHA_MOCK_TOKEN) {
      return { success: true, score: 0.9 };
    }

    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.RECAPTCHA_SECRET_KEY,
        response: token,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`reCAPTCHA service returned ${response.status}`);

    const data = await response.json() as {
      success?: boolean;
      score?: number;
      'error-codes'?: string[];
    };

    const result = {
      success: data.success === true,
      score: typeof data.score === 'number' ? data.score : 0,
    };

    if (env.NODE_ENV !== 'production' && !result.success) {
      logger.warn(
        {
          success: result.success,
          score: result.score,
          errorCodes: data['error-codes'],
          secretIsTestKey: env.RECAPTCHA_SECRET_KEY.startsWith('6LeIxAcTAAAAAGG'),
        },
        'reCAPTCHA verification failed — token caducado/usado, claves v2+v3 mezcladas, o secret incorrecta',
      );
    }

    return result;
  }
}
