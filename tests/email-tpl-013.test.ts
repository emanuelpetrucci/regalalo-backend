import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl013 } from '../src/infrastructure/email/templates/tpl-013-warn-user';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'warned@example.com',
  firstName: 'Carlos',
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-013 — advertencia al denunciado', () => {
  it('14.4 — snapshot', () => {
    const { html } = renderTpl013(fixture);
    expect(html).toMatchSnapshot();
  });

  it('14.4 — contiene color primary', () => {
    const { html } = renderTpl013(fixture);
    expect(html).toContain(tokens.primary);
  });

  it('14.4 — asunto correcto (es)', () => {
    const { subject } = renderTpl013(fixture);
    expect(subject).toBe('Aviso sobre tu actividad en Regálalo');
  });

  it('14.4 — saludo con firstName', () => {
    const { html } = renderTpl013(fixture);
    expect(html).toContain('Hola, Carlos');
  });

  it('14.4 — aviso sobre actividad (es)', () => {
    const { html } = renderTpl013(fixture);
    expect(html).toContain('actividad en Regálalo');
  });

  it('14.4 — sin CTA', () => {
    const { html } = renderTpl013(fixture);
    expect(html).not.toContain('O copia este enlace');
  });

  it('14.4 — sin mención a reporte ni denunciante', () => {
    const { html } = renderTpl013(fixture);
    expect(html).not.toContain('reporte');
    expect(html).not.toContain('denunciante');
  });

  it('14.4 — idioma en (subject + cuerpo)', () => {
    const { subject, html } = renderTpl013(fixture, 'en');
    expect(subject).toBe('Notice about your activity on Regálalo');
    expect(html).toContain('community guidelines');
  });

  it('14.4 — idioma ca (subject + cuerpo)', () => {
    const { subject, html } = renderTpl013(fixture, 'ca');
    expect(subject).toBe('Avís sobre la teva activitat a Regálalo');
    expect(html).toContain('normes de la comunitat');
  });

  it('14.4 — fallback a es con idioma desconocido', () => {
    const { subject } = renderTpl013(fixture, 'fr');
    expect(subject).toBe('Aviso sobre tu actividad en Regálalo');
  });
});
