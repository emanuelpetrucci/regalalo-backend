import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl004 } from '../src/infrastructure/email/templates/tpl-004-session-expired';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'maria@example.com',
  firstName: 'María',
  itemTitle: 'Mesa de madera',
  itemId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-004 — sesión de entrega expirada', () => {
  it('9.3 — snapshot de TPL-004', () => {
    const { html } = renderTpl004(fixture);
    expect(html).toMatchSnapshot();
  });

  it('9.3 — contiene color primary #3A7358', () => {
    const { html } = renderTpl004(fixture);
    expect(html).toContain(tokens.primary);
    expect(tokens.primary).toBe('#3A7358');
  });

  it('9.3 — saludo con firstName', () => {
    const { html } = renderTpl004(fixture);
    expect(html).toContain(`Hola, ${fixture.firstName}`);
  });

  it('9.3 — itemTitle presente en cuerpo', () => {
    const { html } = renderTpl004(fixture);
    expect(html).toContain(fixture.itemTitle);
  });

  it('9.3 — no expone itemId en cuerpo', () => {
    const { html } = renderTpl004(fixture);
    expect(html).not.toContain(fixture.itemId);
  });

  it('9.3 — asunto correcto', () => {
    const { subject } = renderTpl004(fixture);
    expect(subject).toBe('La sesión de entrega de tu objeto ha expirado');
  });

  it('9.3 — preheader presente', () => {
    const { html } = renderTpl004(fixture);
    expect(html).toContain('sesión de entrega venció');
  });

  it('i18n — language=en produce subject y body en inglés', () => {
    const { subject, html } = renderTpl004(fixture, 'en');
    expect(subject).toBe('Your delivery session has expired');
    expect(html).toContain('expired without delivery being confirmed');
    expect(html).toContain('lang="en"');
  });

  it('i18n — language=ca produce subject en catalán', () => {
    const { subject, html } = renderTpl004(fixture, 'ca');
    expect(subject).toBe('La sessió de lliurament del teu objecte ha expirat');
    expect(html).toContain('lang="ca"');
  });
});
