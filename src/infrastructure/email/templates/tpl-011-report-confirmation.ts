import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';
import { escapeHtml } from './escape-html';
import { getReportedEntityLabel, getReportReasonLabel } from './condition-labels';

const TRANSLATIONS = {
  es: {
    subject: 'Hemos recibido tu reporte — Regálalo',
    preheader: 'Confirmación de recepción de tu reporte.',
    title: 'Hemos recibido tu reporte',
    body1: (entityLabel: string, reasonLabel: string) =>
      `Gracias por tu reporte. Hemos recibido tu aviso sobre ${entityLabel} relacionado con ${reasonLabel}.`,
    body2: 'Nuestro equipo de moderación revisará tu reporte y tomará las medidas correspondientes.',
  },
  ca: {
    subject: 'Hem rebut el teu informe — Regálalo',
    preheader: "Confirmació de recepció del teu informe.",
    title: "Hem rebut el teu informe",
    body1: (entityLabel: string, reasonLabel: string) =>
      `Gràcies pel teu informe. Hem rebut el teu avís sobre ${entityLabel} relacionat amb ${reasonLabel}.`,
    body2: "El nostre equip de moderació revisarà el teu informe i prendrà les mesures corresponents.",
  },
  en: {
    subject: 'We have received your report — Regálalo',
    preheader: 'Confirmation of receipt of your report.',
    title: 'We have received your report',
    body1: (entityLabel: string, reasonLabel: string) =>
      `Thank you for your report. We have received your notice about ${entityLabel} related to ${reasonLabel}.`,
    body2: 'Our moderation team will review your report and take the appropriate measures.',
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export function renderTpl011(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const reportedEntityType = variables.reportedEntityType != null ? String(variables.reportedEntityType) : '';
  const reason = variables.reason != null ? String(variables.reason) : '';

  const tr = t(language);
  const entityLabel = escapeHtml(getReportedEntityLabel(reportedEntityType, language));
  const reasonLabel = escapeHtml(getReportReasonLabel(reason, language));

  const bodyHtml =
    renderEmailParagraph(tr.body1(entityLabel, reasonLabel)) +
    renderEmailParagraph(tr.body2);

  const html = renderEmailLayout({
    preheader: tr.preheader,
    firstName,
    title: tr.title,
    bodyHtml,
    language,
  });

  return { subject: tr.subject, html };
}
