import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl011 } from '../src/infrastructure/email/templates/tpl-011-report-confirmation';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'user@example.com',
  firstName: 'Juan',
  reportedEntityType: 'item',
  reason: 'contenido_inadecuado',
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-011 — confirmación al denunciante', () => {
  it('14.4 — snapshot', () => {
    const { html } = renderTpl011(fixture);
    expect(html).toMatchSnapshot();
  });

  it('14.4 — contiene color primary', () => {
    const { html } = renderTpl011(fixture);
    expect(html).toContain(tokens.primary);
  });

  it('14.4 — asunto correcto (es)', () => {
    const { subject } = renderTpl011(fixture);
    expect(subject).toBe('Hemos recibido tu reporte — Regálalo');
  });

  it('14.4 — saludo con firstName', () => {
    const { html } = renderTpl011(fixture);
    expect(html).toContain('Hola, Juan');
  });

  it('14.4 — entity label legible en cuerpo (es)', () => {
    const { html } = renderTpl011(fixture);
    expect(html).toContain('un objeto');
  });

  it('14.4 — reason label en cuerpo (es)', () => {
    const { html } = renderTpl011(fixture);
    expect(html).toContain('Contenido inadecuado');
  });

  it('14.4 — sin CTA', () => {
    const { html } = renderTpl011(fixture);
    expect(html).not.toContain('O copia este enlace');
  });

  it('14.4 — entity label para usuario (es)', () => {
    const { html } = renderTpl011({ ...fixture, reportedEntityType: 'user' });
    expect(html).toContain('otro usuario');
  });

  it('14.4 — idioma en (subject + entity label)', () => {
    const { subject, html } = renderTpl011(fixture, 'en');
    expect(subject).toBe('We have received your report — Regálalo');
    expect(html).toContain('an item');
    expect(html).toContain('Inappropriate content');
  });

  it('14.4 — idioma ca (subject + entity label)', () => {
    const { subject, html } = renderTpl011(fixture, 'ca');
    expect(subject).toBe('Hem rebut el teu informe — Regálalo');
    expect(html).toContain('un objecte');
    expect(html).toContain('Contingut inadequat');
  });

  it('14.4 — fallback a es con idioma desconocido', () => {
    const { subject } = renderTpl011(fixture, 'fr');
    expect(subject).toBe('Hemos recibido tu reporte — Regálalo');
  });
});
