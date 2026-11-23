import { describe, it, expect } from 'vitest';
import { renderTpl010 } from '../src/infrastructure/email/templates/tpl-010-nearby-items-digest';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  recipientEmail: 'user@example.com',
  firstName: 'Ana',
  appUrl: 'https://app.test.example.com',
  itemCount: 2,
  itemsJson: JSON.stringify([
    {
      itemId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      title: 'Bicicleta',
      condition: 'good',
      distanceKm: 2,
      imageUrl: 'https://cdn.test/items/bike.jpg',
    },
    {
      itemId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      title: 'Silla',
      condition: 'fair',
      distanceKm: 5,
    },
  ]),
};

describe('email-tpl-010 — digest de objetos cercanos', () => {
  it('10.1 — snapshot de TPL-010', () => {
    const { html } = renderTpl010(fixture);
    expect(html).toMatchSnapshot();
  });

  it('10.1 — asunto, titular y CTA en voseo', () => {
    const { subject, html } = renderTpl010(fixture);
    expect(subject).toBe('Nuevos objetos disponibles cerca tuyo');
    expect(html).toContain('Nuevos objetos disponibles cerca tuyo');
    expect(html).not.toContain('cerca de ti');
    expect(html).toContain('Explorar objetos');
    expect(html).toContain(`${fixture.appUrl}/explorar`);
    expect(html).toContain(tokens.primary);
  });

  it('10.1 — alt descriptivo y etiqueta de estado en filas', () => {
    const { html } = renderTpl010(fixture);
    expect(html).toContain('alt="Bicicleta"');
    expect(html).toContain('Buen estado · ~2 km de vos');
    expect(html).toContain('Estado regular · ~5 km de vos');
  });

  it('10.1 — concordancia singular en párrafo introductorio', () => {
    const { html } = renderTpl010({
      ...fixture,
      itemCount: 1,
      itemsJson: JSON.stringify([
        {
          itemId: 'x',
          title: 'Libro',
          condition: 'good',
          distanceKm: 1,
        },
      ]),
    });
    expect(html).toMatch(/Hay 1 objeto nuevo disponible cerca tuyo en la última hora/);
    expect(html).not.toMatch(/Hay \d+ objetos nuevos disponibles cerca tuyo/);
  });

  it('10.1 — usa longitud de lista parseada, no itemCount del payload', () => {
    const { html } = renderTpl010({
      ...fixture,
      itemCount: 99,
      itemsJson: 'not-valid-json',
    });
    expect(html).toContain('Hay 0 objetos nuevos disponibles cerca tuyo');
    expect(html).not.toContain('99 objetos');
  });

  it('10.1 — escapa HTML en títulos', () => {
    const { html } = renderTpl010({
      ...fixture,
      itemsJson: JSON.stringify([
        {
          itemId: 'x',
          title: '<script>alert(1)</script>',
          condition: 'good',
          distanceKm: 1,
        },
      ]),
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('i18n — language=en produce subject, distancia y condición en inglés', () => {
    const { subject, html } = renderTpl010(fixture, 'en');
    expect(subject).toBe('New items available near you');
    expect(html).toContain('km from you');
    expect(html).toContain('Good condition');
    expect(html).toContain('lang="en"');
  });

  it('i18n — language=ca produce subject y distancia en catalán', () => {
    const { subject, html } = renderTpl010(fixture, 'ca');
    expect(subject).toBe('Nous objectes disponibles a prop teu');
    expect(html).toContain('km de tu');
    expect(html).toContain('lang="ca"');
  });
});
