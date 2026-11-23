import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl002 } from '../src/infrastructure/email/templates/tpl-002-reset-password';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'maria@example.com',
  firstName: 'María',
  resetLink: 'https://example.com/reset-password?token=xyz789',
  expiresInMinutes: 60,
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-002 — recuperación de contraseña', () => {
  it('9.2 — snapshot de TPL-002', () => {
    const { html } = renderTpl002(fixture);
    expect(html).toMatchSnapshot();
  });

  it('9.2 — contiene color primary #3A7358', () => {
    const { html } = renderTpl002(fixture);
    expect(html).toContain(tokens.primary);
    expect(tokens.primary).toBe('#3A7358');
  });

  it('9.2 — CTA "Restablecer contraseña" presente', () => {
    const { html } = renderTpl002(fixture);
    expect(html).toContain('Restablecer contraseña');
  });

  it('9.2 — resetLink en CTA y fallback', () => {
    const { html } = renderTpl002(fixture);
    expect(html).toContain(fixture.resetLink);
    expect(html).toContain('O copia este enlace');
  });

  it('9.2 — saludo con firstName', () => {
    const { html } = renderTpl002(fixture);
    expect(html).toContain(`Hola, ${fixture.firstName}`);
  });

  it('9.2 — asunto correcto', () => {
    const { subject } = renderTpl002(fixture);
    expect(subject).toBe('Recuperá tu contraseña');
  });

  it('9.2 — preheader presente', () => {
    const { html } = renderTpl002(fixture);
    expect(html).toContain('Restablecé tu contraseña y volvé a acceder.');
  });

  it('9.2 — expiresInMinutes presente en cuerpo', () => {
    const { html } = renderTpl002(fixture);
    expect(html).toContain('60 minutos');
  });

  it('i18n — language=en produce subject y CTA en inglés', () => {
    const { subject, html } = renderTpl002(fixture, 'en');
    expect(subject).toBe('Reset your password');
    expect(html).toContain('Reset password');
    expect(html).toContain(`Hello, ${fixture.firstName}`);
    expect(html).toContain('lang="en"');
  });

  it('i18n — language=ca produce subject en catalán', () => {
    const { subject, html } = renderTpl002(fixture, 'ca');
    expect(subject).toBe('Restableix la teva contrasenya');
    expect(html).toContain('Restablir contrasenya');
    expect(html).toContain('lang="ca"');
  });
});
