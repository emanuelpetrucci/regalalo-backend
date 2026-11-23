import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTpl006 } from '../src/infrastructure/email/templates/tpl-006-new-request';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-006 — nueva solicitud de objeto', () => {
  const fixture = {
    recipientEmail: 'donor@example.com',
    firstName: 'Ana',
    itemTitle: 'Mesa de madera',
    itemId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  };

  it('9.3 — snapshot de TPL-006 con itemTitle', () => {
    const { html } = renderTpl006(fixture);
    expect(html).toMatchSnapshot();
  });

  it('9.3 — contiene color primary #3A7358', () => {
    const { html } = renderTpl006(fixture);
    expect(html).toContain(tokens.primary);
    expect(tokens.primary).toBe('#3A7358');
  });

  it('9.3 — saludo con firstName', () => {
    const { html } = renderTpl006(fixture);
    expect(html).toContain(`Hola, ${fixture.firstName}`);
  });

  it('9.3 — itemTitle presente en cuerpo', () => {
    const { html } = renderTpl006(fixture);
    expect(html).toContain(fixture.itemTitle);
  });

  it('9.3 — asunto correcto', () => {
    const { subject } = renderTpl006(fixture);
    expect(subject).toBe('Tienes una nueva solicitud para tu objeto');
  });

  it('9.3 — preheader presente', () => {
    const { html } = renderTpl006(fixture);
    expect(html).toContain('solicitó tu objeto');
  });

  it('9.3 — CTA "Ver candidatos" con deep link al ítem', () => {
    const { html } = renderTpl006(fixture);
    expect(html).toContain('Ver candidatos');
    expect(html).toContain(`/items/${fixture.itemId}`);
  });

  it('9.3 — sin itemId: CTA apunta a APP_PUBLIC_URL base', () => {
    const { html } = renderTpl006({ firstName: 'Ana', recipientEmail: 'donor@example.com', itemTitle: 'Mesa' });
    expect(html).toContain('Ver candidatos');
    expect(html).not.toContain('/items/');
    expect(html).toContain('https://app.test.example.com');
  });

  it('9.3 — sin itemTitle: renderiza sin nombre', () => {
    const { html } = renderTpl006({ firstName: 'Ana', recipientEmail: 'donor@example.com' });
    expect(html).toContain('solicitó tu objeto');
    expect(html).not.toContain('«»');
  });

  it('i18n — language=en produce subject y CTA en inglés', () => {
    const { subject, html } = renderTpl006(fixture, 'en');
    expect(subject).toBe('You have a new request for your item');
    expect(html).toContain('View candidates');
    expect(html).toContain('lang="en"');
  });

  it('i18n — language=ca produce subject en catalán', () => {
    const { subject, html } = renderTpl006(fixture, 'ca');
    expect(subject).toBe('Tens una nova sol·licitud per al teu objecte');
    expect(html).toContain('Veure candidats');
    expect(html).toContain('lang="ca"');
  });
});
