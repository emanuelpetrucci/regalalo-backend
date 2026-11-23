import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl005 } from '../src/infrastructure/email/templates/tpl-005-cancellation';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'carlos@example.com',
  firstName: 'Carlos',
  itemTitle: 'Mesa de madera',
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-005 — objeto cancelado con sesión activa', () => {
  it('9.3 — snapshot de TPL-005', () => {
    const { html } = renderTpl005(fixture);
    expect(html).toMatchSnapshot();
  });

  it('9.3 — contiene color primary #3A7358', () => {
    const { html } = renderTpl005(fixture);
    expect(html).toContain(tokens.primary);
    expect(tokens.primary).toBe('#3A7358');
  });

  it('9.3 — saludo con firstName', () => {
    const { html } = renderTpl005(fixture);
    expect(html).toContain(`Hola, ${fixture.firstName}`);
  });

  it('9.3 — itemTitle presente en cuerpo', () => {
    const { html } = renderTpl005(fixture);
    expect(html).toContain(fixture.itemTitle);
  });

  it('9.3 — asunto correcto', () => {
    const { subject } = renderTpl005(fixture);
    expect(subject).toBe('Actualización sobre el objeto que ibas a recibir');
  });

  it('9.3 — preheader presente', () => {
    const { html } = renderTpl005(fixture);
    expect(html).toContain('donante canceló el objeto');
  });

  it('i18n — language=en produce subject y body en inglés', () => {
    const { subject, html } = renderTpl005(fixture, 'en');
    expect(subject).toBe('Update on the item you were going to receive');
    expect(html).toContain('The donor cancelled the item');
    expect(html).toContain('lang="en"');
  });

  it('i18n — language=ca produce subject en catalán', () => {
    const { subject, html } = renderTpl005(fixture, 'ca');
    expect(subject).toBe("Actualització sobre l'objecte que anaves a rebre");
    expect(html).toContain('lang="ca"');
  });
});
