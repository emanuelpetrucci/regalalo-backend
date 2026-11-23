import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderTplAdm002 } from '../src/infrastructure/email/templates/tpl-adm-002-new-report-admin';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixture = {
  reportId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  reportedEntityType: 'objeto',
  reason: 'Fraude o engaño',
  entitySnapshotTitle: 'Mesa de madera',
  reporterFirstName: 'Juan',
  createdAt: '2026-06-10T10:30:00.000Z',
  adminPanelBaseUrl: 'https://admin.regalalo.org',
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-tpl-adm-002 — notificación al operador', () => {
  it('14.4 — snapshot', () => {
    const { html } = renderTplAdm002(fixture);
    expect(html).toMatchSnapshot();
  });

  it('14.4 — contiene color primary', () => {
    const { html } = renderTplAdm002(fixture);
    expect(html).toContain(tokens.primary);
  });

  it('14.4 — asunto con formato correcto', () => {
    const { subject } = renderTplAdm002(fixture);
    expect(subject).toBe('[Regálalo] Nuevo reporte — Fraude o engaño — objeto');
  });

  it('14.4 — firstName forzado a administrador', () => {
    const { html } = renderTplAdm002(fixture);
    expect(html).toContain('Hola, administrador');
  });

  it('14.4 — enlace al panel con reportId', () => {
    const { html } = renderTplAdm002(fixture);
    expect(html).toContain(`/reportes/${fixture.reportId}`);
  });

  it('14.4 — reportId en cuerpo', () => {
    const { html } = renderTplAdm002(fixture);
    expect(html).toContain(fixture.reportId);
  });

  it('14.4 — entitySnapshotTitle en cuerpo', () => {
    const { html } = renderTplAdm002(fixture);
    expect(html).toContain('Mesa de madera');
  });

  it('14.4 — reporterFirstName en cuerpo', () => {
    const { html } = renderTplAdm002(fixture);
    expect(html).toContain('Juan');
  });
});
