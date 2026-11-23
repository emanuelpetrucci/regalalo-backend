import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecaptchaService } from '../src/infrastructure/security/recaptcha.service';
import { DEV_RECAPTCHA_MOCK_TOKEN } from '../src/infrastructure/security/recaptcha.constants';

describe('RecaptchaService', () => {
  const originalNodeEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    process.env['NODE_ENV'] = 'development';
    process.env['RECAPTCHA_SECRET_KEY'] = '6LeIxAcTAAAAAGG-vFIakTenRMu5K-qrrPiG02-1';
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('acepta dev-mock-recaptcha-token en desarrollo sin llamar a Google', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const service = new RecaptchaService();

    const result = await service.verify(DEV_RECAPTCHA_MOCK_TOKEN);

    expect(result).toEqual({ success: true, score: 0.9 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
