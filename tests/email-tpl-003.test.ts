import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl003 } from '../src/infrastructure/email/templates/tpl-003-receiver-selected';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'carlos@example.com',
  firstName: 'Carlos',
  itemTitle: 'Mesa de madera',
  itemCondition: 'good',
  donorReputationScore: 4.8,
  sessionDeadlineAt: '2026-02-01T12:00:00.000Z',
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-003 — receptor seleccionado', () => {
  it('9.3 — snapshot de TPL-003', () => {
    const { html } = renderTpl003(fixture);
    expect(html).toMatchSnapshot();
  });

  it('9.3 — contiene color primary #3A7358', () => {
    const { html } = renderTpl003(fixture);
    expect(html).toContain(tokens.primary);
    expect(tokens.primary).toBe('#3A7358');
  });

  it('9.3 — CTA "Ver en la app" presente', () => {
    const { html } = renderTpl003(fixture);
    expect(html).toContain('Ver en la app');
  });

  it('9.3 — saludo con firstName', () => {
    const { html } = renderTpl003(fixture);
    expect(html).toContain(`Hola, ${fixture.firstName}`);
  });

  it('9.3 — itemTitle presente en cuerpo', () => {
    const { html } = renderTpl003(fixture);
    expect(html).toContain(fixture.itemTitle);
  });

  it('9.3 — itemCondition mapeado a etiqueta en español', () => {
    const { html } = renderTpl003(fixture);
    expect(html).toContain('buen estado');
    expect(html).not.toContain('(estado: good)');
  });

  it('9.3 — itemCondition desconocido: fallback al valor raw', () => {
    const { html } = renderTpl003({ ...fixture, itemCondition: 'unknown_value' });
    expect(html).toContain('unknown_value');
  });

  it('9.3 — sessionDeadlineAt formateado como YYYY-MM-DD HH:mm', () => {
    const { html } = renderTpl003(fixture);
    expect(html).toContain('2026-02-01 12:00');
    expect(html).not.toContain('2026-02-01T12:00:00.000Z');
  });

  it('9.3 — asunto correcto', () => {
    const { subject } = renderTpl003(fixture);
    expect(subject).toBe('¡Fuiste seleccionado/a como receptor!');
  });

  it('9.3 — preheader presente', () => {
    const { html } = renderTpl003(fixture);
    expect(html).toContain('Fuiste seleccionado/a para recibir un objeto');
  });

  it('i18n — language=en produce subject, CTA y condición en inglés', () => {
    const { subject, html } = renderTpl003(fixture, 'en');
    expect(subject).toBe("You've been selected as receiver!");
    expect(html).toContain('good condition');
    expect(html).toContain('View in app');
    expect(html).toContain('lang="en"');
  });

  it('i18n — language=ca produce subject en catalán', () => {
    const { subject, html } = renderTpl003(fixture, 'ca');
    expect(subject).toBe('Has estat seleccionat/da com a receptor!');
    expect(html).toContain('bon estat');
    expect(html).toContain('lang="ca"');
  });
});
