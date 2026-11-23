import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderEmailLayout, renderEmailButton } from '../src/infrastructure/email/templates/index';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

const fixture = {
  preheader: 'Un click y ya podés publicar, pedir o regalar lo que no vendés.',
  firstName: 'Juan',
  title: 'Confirmá tu email y empezá en Regálalo',
  bodyHtml: '<p>Confirma tu dirección de email haciendo clic en el botón.</p>',
  cta: { label: 'Confirmar mi email', href: 'https://example.com/verify?token=abc123' },
  fallbackLink: 'https://example.com/fallback?token=abc123',
};

describe('email-layout', () => {
  it('9.1 — snapshot del layout con fixture mínimo', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toMatchSnapshot();
  });

  it('9.1 — contiene color primary del token (#3A7358)', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toContain(tokens.primary);
    expect(tokens.primary).toBe('#3A7358');
  });

  it('9.1 — zona preheader presente', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toContain(fixture.preheader);
    expect(html).toContain('mso-hide: all');
  });

  it('9.1 — zona header con nombre de marca', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toContain('Regálalo');
  });

  it('9.1 — zona saludo con firstName', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toContain(`Hola, ${fixture.firstName}`);
  });

  it('9.1 — zona titular (h1) presente', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toContain('<h1');
    expect(html).toContain(fixture.title);
  });

  it('9.1 — zona cuerpo presente', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toContain('Confirma tu dirección de email');
  });

  it('9.1 — zona CTA con href y label', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toContain(fixture.cta.href);
    expect(html).toContain(fixture.cta.label);
  });

  it('9.1 — zona fallback link presente y distinta del CTA', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toContain(fixture.fallbackLink);
    expect(html).toContain('O copia este enlace');
    expect(fixture.fallbackLink).not.toBe(fixture.cta.href);
  });

  it('9.1 — zona footer con soporte y copyright', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toContain('soporte');
    expect(html).toContain('© 2026 Regálalo');
  });

  it('9.1 — ancho máximo de 600px (table-based)', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toContain('width="600"');
    expect(html).toContain('max-width: 600px');
  });

  it('9.1 — estilos inline únicamente (no hay bloque <style>)', () => {
    const html = renderEmailLayout(fixture);
    expect(html).not.toContain('<style');
  });

  it('9.1 — sin CTA cuando no se provee', () => {
    const { cta: _, fallbackLink: __, ...noCtaFixture } = fixture;
    const html = renderEmailLayout(noCtaFixture);
    expect(html).not.toContain('Confirmar mi email');
    expect(html).not.toContain('O copia este enlace');
  });

  it('9.1 — HTML renderizado no contiene hex hardcodeados fuera de tokens', () => {
    const html = renderEmailLayout(fixture);
    const tokenHexValues = new Set(
      (Object.values(tokens) as string[])
        .filter(v => /^#[0-9A-Fa-f]{3,6}$/.test(v))
        .map(v => v.toLowerCase()),
    );
    const foundHex = [...html.matchAll(/#[0-9A-Fa-f]{3,6}/gi)].map(m => m[0].toLowerCase());
    const unknownHex = foundHex.filter(h => !tokenHexValues.has(h));
    expect(unknownHex).toEqual([]);
  });

  it('9.1 — firstName con HTML especial se escapa correctamente', () => {
    const html = renderEmailLayout({ ...fixture, firstName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('9.1 — renderEmailButton lanza error si href no es https (solo en producción)', () => {
    const original = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      expect(() => renderEmailButton({ label: 'test', href: 'javascript:alert(1)' })).toThrow();
      expect(() => renderEmailButton({ label: 'test', href: 'http://example.com' })).toThrow();
    } finally {
      process.env['NODE_ENV'] = original;
    }
  });

  it('9.1 — renderEmailLayout lanza error si fallbackLink no es https (solo en producción)', () => {
    const original = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      expect(() =>
        renderEmailLayout({ ...fixture, fallbackLink: 'javascript:alert(1)' }),
      ).toThrow();
    } finally {
      process.env['NODE_ENV'] = original;
    }
  });

  it('i18n — language=en produce saludo y fallback en inglés', () => {
    const html = renderEmailLayout({ ...fixture, language: 'en' });
    expect(html).toContain(`Hello, ${fixture.firstName}`);
    expect(html).toContain('Or copy this link:');
    expect(html).toContain('lang="en"');
  });

  it('i18n — language=ca produce saludo y fallback en catalán', () => {
    const html = renderEmailLayout({ ...fixture, language: 'ca' });
    expect(html).toContain(`Hola, ${fixture.firstName}`);
    expect(html).toContain('O copia aquest enllaç:');
    expect(html).toContain('lang="ca"');
  });

  it('i18n — sin language produce saludo en español (fallback)', () => {
    const html = renderEmailLayout(fixture);
    expect(html).toContain(`Hola, ${fixture.firstName}`);
    expect(html).toContain('O copia este enlace:');
    expect(html).toContain('lang="es"');
  });
});
