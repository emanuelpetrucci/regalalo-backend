import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl008 } from '../src/infrastructure/email/templates/tpl-008-password-reset-done';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'maria@example.com',
  firstName: 'María',
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-008 — contraseña restablecida', () => {
  it('9.2 — snapshot de TPL-008', () => {
    const { html } = renderTpl008(fixture);
    expect(html).toMatchSnapshot();
  });

  it('9.2 — contiene color primary #3A7358', () => {
    const { html } = renderTpl008(fixture);
    expect(html).toContain(tokens.primary);
    expect(tokens.primary).toBe('#3A7358');
  });

  it('9.2 — saludo con firstName', () => {
    const { html } = renderTpl008(fixture);
    expect(html).toContain(`Hola, ${fixture.firstName}`);
  });

  it('9.2 — asunto correcto', () => {
    const { subject } = renderTpl008(fixture);
    expect(subject).toBe('Tu contraseña ha sido restablecida');
  });

  it('9.2 — sin CTA (no hay enlace de acción)', () => {
    const { html } = renderTpl008(fixture);
    expect(html).not.toContain('O copia este enlace');
  });

  it('9.2 — mensaje de confirmación presente', () => {
    const { html } = renderTpl008(fixture);
    expect(html).toContain('restablecida correctamente');
  });

  it('i18n — language=en produce subject y body en inglés', () => {
    const { subject, html } = renderTpl008(fixture, 'en');
    expect(subject).toBe('Your password has been reset');
    expect(html).toContain('reset successfully');
    expect(html).toContain('lang="en"');
  });

  it('i18n — language=ca produce subject en catalán', () => {
    const { subject, html } = renderTpl008(fixture, 'ca');
    expect(subject).toBe('La teva contrasenya ha estat restablerta');
    expect(html).toContain('lang="ca"');
  });
});
