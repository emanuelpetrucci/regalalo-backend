import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  ACTIVE_EMAIL_TEMPLATE_IDS,
  emailTemplateRegistry,
} from '../src/infrastructure/email/templates/registry';
import { tokens } from '../src/infrastructure/email/tokens/email-design-tokens';

const fixtures: Record<string, Record<string, string | number>> = {
  'TPL-001': {
    recipientEmail: 'new-user@example.com',
    firstName: 'Emanuel',
  },
  'TPL-002': {
    recipientEmail: 'maria@example.com',
    firstName: 'María',
    resetLink: 'https://example.com/reset-password?token=xyz789',
    expiresInMinutes: 60,
  },
  'TPL-003': {
    recipientEmail: 'carlos@example.com',
    firstName: 'Carlos',
    itemTitle: 'Mesa de madera',
    itemCondition: 'good',
    donorReputationScore: 4.8,
    sessionDeadlineAt: '2026-02-01T12:00:00.000Z',
  },
  'TPL-004': {
    recipientEmail: 'maria@example.com',
    firstName: 'María',
    itemTitle: 'Mesa de madera',
    itemId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  },
  'TPL-005': {
    recipientEmail: 'carlos@example.com',
    firstName: 'Carlos',
    itemTitle: 'Mesa de madera',
  },
  'TPL-006': {
    recipientEmail: 'donor@example.com',
    firstName: 'Ana',
    itemTitle: 'Mesa de madera',
    itemId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  },
  'TPL-007': {
    recipientEmail: 'donor@example.com',
    firstName: 'Lucía',
    itemTitle: 'Silla de oficina',
    itemId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  },
  'TPL-008': {
    recipientEmail: 'maria@example.com',
    firstName: 'María',
  },
  'TPL-009': {
    recipientEmail: 'maria@example.com',
    firstName: 'María',
    verificationLink: 'https://example.com/verificar-email?token=abc123',
    expiresInHours: 24,
  },
  'TPL-010': {
    recipientEmail: 'nearby@example.com',
    firstName: 'Ana',
    appUrl: 'https://app.test.example.com',
    itemCount: 1,
    itemsJson: JSON.stringify([
      {
        itemId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        title: 'Bicicleta',
        condition: 'good',
        distanceKm: 3,
      },
    ]),
  },
  'TPL-ADM-001': {
    otp: '123456',
    expiresInMinutes: 10,
  },
  'TPL-011': {
    recipientEmail: 'user@example.com',
    firstName: 'Juan',
    reportedEntityType: 'item',
    reason: 'contenido_inadecuado',
  },
  'TPL-012': {
    recipientEmail: 'reporter@example.com',
    firstName: 'María',
    reportedEntityType: 'user',
  },
  'TPL-013': {
    recipientEmail: 'warned@example.com',
    firstName: 'Carlos',
  },
  'TPL-ADM-002': {
    reportId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    reportedEntityType: 'objeto',
    reason: 'Fraude o engaño',
    entitySnapshotTitle: 'Mesa de madera',
    reporterFirstName: 'Juan',
    createdAt: '2026-06-10T10:30:00.000Z',
    adminPanelBaseUrl: 'https://admin.regalalo.org',
  },
};

const LAYOUT_MARKERS = {
  brand: 'Regálalo',
  tableWidth: 'width="600"',
  footerCopyright: '© 2026 Regálalo',
} as const;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('email-templates.snap — registry TPL-001…010', () => {
  it('9.5 — registry cubre exactamente TPL-001…013 y TPL-ADM-001…002', () => {
    expect([...ACTIVE_EMAIL_TEMPLATE_IDS].sort()).toEqual([
      'TPL-001',
      'TPL-002',
      'TPL-003',
      'TPL-004',
      'TPL-005',
      'TPL-006',
      'TPL-007',
      'TPL-008',
      'TPL-009',
      'TPL-010',
      'TPL-011',
      'TPL-012',
      'TPL-013',
      'TPL-ADM-001',
      'TPL-ADM-002',
    ]);
  });

  it.each(ACTIVE_EMAIL_TEMPLATE_IDS)(
    '9.5 — %s pasa por renderEmailLayout (header/footer) y snapshot',
    (templateId) => {
      const render = emailTemplateRegistry[templateId];
      const variables = fixtures[templateId];
      const { subject, html } = render(variables);

      expect(subject.length).toBeGreaterThan(0);
      expect(html).toContain(LAYOUT_MARKERS.brand);
      expect(html).toContain(LAYOUT_MARKERS.tableWidth);
      expect(html).toContain(LAYOUT_MARKERS.footerCopyright);
      expect(html).toContain(tokens.primary);
      expect(html).not.toContain('<style');
      expect(html).toMatchSnapshot();
    },
  );
});
