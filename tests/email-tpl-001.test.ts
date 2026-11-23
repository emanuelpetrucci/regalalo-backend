import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl001 } from '../src/infrastructure/email/templates/tpl-001-welcome';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'new-user@example.com',
  firstName: 'Emanuel',
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-001 — catálogo bienvenida', () => {
  it('9.4 — snapshot de TPL-001', () => {
    const { html } = renderTpl001(fixture);
    expect(html).toMatchSnapshot();
  });

  it('9.4 — contiene color primary #3A7358', () => {
    const { html } = renderTpl001(fixture);
    expect(html).toContain(tokens.primary);
    expect(tokens.primary).toBe('#3A7358');
  });

  it('9.4 — saludo con firstName', () => {
    const { html } = renderTpl001(fixture);
    expect(html).toContain(`Hola, ${fixture.firstName}`);
  });

  it('9.4 — copy de bienvenida presente', () => {
    const { html } = renderTpl001(fixture);
    expect(html).toContain('Tu cuenta ya está lista');
  });

  it('9.4 — escapa HTML en firstName', () => {
    const { html } = renderTpl001({
      ...fixture,
      firstName: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('9.4 — asunto correcto', () => {
    const { subject } = renderTpl001(fixture);
    expect(subject).toBe('¡Bienvenido a Regálalo!');
  });

  it('i18n — language=en produce subject y body en inglés', () => {
    const { subject, html } = renderTpl001(fixture, 'en');
    expect(subject).toBe('Welcome to Regálalo!');
    expect(html).toContain('Your account is ready.');
    expect(html).toContain(`Hello, ${fixture.firstName}`);
    expect(html).toContain('lang="en"');
  });

  it('i18n — language=ca produce subject y body en catalán', () => {
    const { subject, html } = renderTpl001(fixture, 'ca');
    expect(subject).toBe('Benvingut/da a Regálalo!');
    expect(html).toContain('El teu compte ja està llest.');
    expect(html).toContain(`Hola, ${fixture.firstName}`);
    expect(html).toContain('lang="ca"');
  });

  it('i18n — idioma desconocido hace fallback a español', () => {
    const { subject, html } = renderTpl001(fixture, 'xx' as string);
    expect(subject).toBe('¡Bienvenido a Regálalo!');
    expect(html).toContain('Tu cuenta ya está lista');
  });
});
