import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl009 } from '../src/infrastructure/email/templates/tpl-009-email-verification';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'maria@example.com',
  firstName: 'María',
  verificationLink: 'https://example.com/verificar-email?token=abc123',
  expiresInHours: 24,
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-009 — verificación de email', () => {
  it('9.2 — snapshot de TPL-009', () => {
    const { html } = renderTpl009(fixture);
    expect(html).toMatchSnapshot();
  });

  it('9.2 — contiene color primary #3A7358', () => {
    const { html } = renderTpl009(fixture);
    expect(html).toContain(tokens.primary);
    expect(tokens.primary).toBe('#3A7358');
  });

  it('9.2 — CTA "Confirmar mi email" presente', () => {
    const { html } = renderTpl009(fixture);
    expect(html).toContain('Confirmar mi email');
  });

  it('9.2 — verificationLink en CTA y fallback', () => {
    const { html } = renderTpl009(fixture);
    expect(html).toContain(fixture.verificationLink);
    expect(html).toContain('O copia este enlace');
  });

  it('9.2 — saludo con firstName', () => {
    const { html } = renderTpl009(fixture);
    expect(html).toContain(`Hola, ${fixture.firstName}`);
  });

  it('9.2 — asunto correcto', () => {
    const { subject } = renderTpl009(fixture);
    expect(subject).toBe('Confirmá tu email y empezá en Regálalo');
  });

  it('9.2 — expiresInHours presente en cuerpo', () => {
    const { html } = renderTpl009(fixture);
    expect(html).toContain('24 horas');
  });

  it('9.2 — preheader presente', () => {
    const { html } = renderTpl009(fixture);
    expect(html).toContain('Un click y ya podés publicar');
  });

  it('i18n — language=en produce subject, CTA y fallback en inglés', () => {
    const { subject, html } = renderTpl009(fixture, 'en');
    expect(subject).toBe('Confirm your email and start on Regálalo');
    expect(html).toContain('Confirm my email');
    expect(html).toContain('Or copy this link:');
    expect(html).toContain('lang="en"');
  });

  it('i18n — language=ca produce subject en catalán', () => {
    const { subject, html } = renderTpl009(fixture, 'ca');
    expect(subject).toBe('Confirma el teu email i comença a Regálalo');
    expect(html).toContain('Confirmar el meu email');
    expect(html).toContain('lang="ca"');
  });
});
