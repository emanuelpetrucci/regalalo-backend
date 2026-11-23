import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl012 } from '../src/infrastructure/email/templates/tpl-012-report-resolved';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'reporter@example.com',
  firstName: 'María',
  reportedEntityType: 'user',
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-012 — resolución al denunciante', () => {
  it('14.4 — snapshot', () => {
    const { html } = renderTpl012(fixture);
    expect(html).toMatchSnapshot();
  });

  it('14.4 — contiene color primary', () => {
    const { html } = renderTpl012(fixture);
    expect(html).toContain(tokens.primary);
  });

  it('14.4 — asunto correcto (es)', () => {
    const { subject } = renderTpl012(fixture);
    expect(subject).toBe('Hemos revisado tu reporte — Regálalo');
  });

  it('14.4 — saludo con firstName', () => {
    const { html } = renderTpl012(fixture);
    expect(html).toContain('Hola, María');
  });

  it('14.4 — frase medidas oportunas (es)', () => {
    const { html } = renderTpl012(fixture);
    expect(html).toContain('medidas que consideramos oportunas');
  });

  it('14.4 — entity label legible en cuerpo (es — user)', () => {
    const { html } = renderTpl012(fixture);
    expect(html).toContain('otro usuario');
  });

  it('14.4 — sin CTA', () => {
    const { html } = renderTpl012(fixture);
    expect(html).not.toContain('O copia este enlace');
  });

  it('14.4 — entity label para objeto (es — item)', () => {
    const { html } = renderTpl012({ ...fixture, reportedEntityType: 'item' });
    expect(html).toContain('un objeto');
  });

  it('14.4 — idioma en (subject + entity label)', () => {
    const { subject, html } = renderTpl012(fixture, 'en');
    expect(subject).toBe('We have reviewed your report — Regálalo');
    expect(html).toContain('another user');
    expect(html).toContain('measures we consider appropriate');
  });

  it('14.4 — idioma ca (subject + entity label)', () => {
    const { subject, html } = renderTpl012(fixture, 'ca');
    expect(subject).toBe('Hem revisat el teu informe — Regálalo');
    expect(html).toContain('un altre usuari');
    expect(html).toContain('mesures que considerem oportunes');
  });

  it('14.4 — fallback a es con idioma desconocido', () => {
    const { subject } = renderTpl012(fixture, 'fr');
    expect(subject).toBe('Hemos revisado tu reporte — Regálalo');
  });
});
