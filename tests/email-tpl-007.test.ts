import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl007 } from '../src/infrastructure/email/templates/tpl-007-degradation';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'donor@example.com',
  firstName: 'Lucía',
  itemTitle: 'Silla de oficina',
  itemId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-007 — degradación por inactividad', () => {
  it('9.4 — snapshot de TPL-007', () => {
    const { html } = renderTpl007(fixture);
    expect(html).toMatchSnapshot();
  });

  it('9.4 — contiene color primary #3A7358', () => {
    const { html } = renderTpl007(fixture);
    expect(html).toContain(tokens.primary);
    expect(tokens.primary).toBe('#3A7358');
  });

  it('9.4 — saludo con firstName', () => {
    const { html } = renderTpl007(fixture);
    expect(html).toContain(`Hola, ${fixture.firstName}`);
  });

  it('9.4 — menciona itemTitle sin exponer itemId', () => {
    const { html } = renderTpl007(fixture);
    expect(html).toContain(fixture.itemTitle);
    expect(html).not.toContain(fixture.itemId);
  });

  it('9.4 — copy de inactividad y tablón', () => {
    const { html } = renderTpl007(fixture);
    expect(html).toContain('más de 7 días');
    expect(html).toContain('tablón');
    expect(html).not.toContain('degrad');
  });

  it('9.4 — escapa HTML en variables dinámicas', () => {
    const { html } = renderTpl007({
      ...fixture,
      firstName: '<b>Lucía</b>',
      itemTitle: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('9.4 — asunto correcto', () => {
    const { subject } = renderTpl007(fixture);
    expect(subject).toBe('Tu objeto lleva tiempo publicado');
  });

  it('i18n — language=en produce subject y body en inglés', () => {
    const { subject, html } = renderTpl007(fixture, 'en');
    expect(subject).toBe('Your item has been listed for a while');
    expect(html).toContain('more than 7 days');
    expect(html).toContain('lang="en"');
  });

  it('i18n — language=ca produce subject en catalán', () => {
    const { subject, html } = renderTpl007(fixture, 'ca');
    expect(subject).toBe('El teu objecte fa temps que està publicat');
    expect(html).toContain('lang="ca"');
  });
});
