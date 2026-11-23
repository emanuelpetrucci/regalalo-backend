import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';
import { escapeHtml } from './escape-html';
import { getReportedEntityLabel } from './condition-labels';

const TRANSLATIONS = {
  es: {
    subject: 'Hemos revisado tu reporte — Regálalo',
    preheader: 'Tu reporte ha sido revisado.',
    title: 'Hemos revisado tu reporte',
    body1: (entityLabel: string) =>
      `Gracias por confiar en Regálalo. Queremos informarte que hemos revisado tu reporte sobre ${entityLabel}.`,
    body2: 'Hemos tomado las medidas que consideramos oportunas para mantener la comunidad segura.',
  },
  ca: {
    subject: 'Hem revisat el teu informe — Regálalo',
    preheader: "El teu informe ha estat revisat.",
    title: "Hem revisat el teu informe",
    body1: (entityLabel: string) =>
      `Gràcies per confiar en Regálalo. Et volem informar que hem revisat el teu informe sobre ${entityLabel}.`,
    body2: "Hem pres les mesures que considerem oportunes per mantenir la comunitat segura.",
  },
  en: {
    subject: 'We have reviewed your report — Regálalo',
    preheader: 'Your report has been reviewed.',
    title: 'We have reviewed your report',
    body1: (entityLabel: string) =>
      `Thank you for trusting Regálalo. We want to let you know that we have reviewed your report about ${entityLabel}.`,
    body2: 'We have taken the measures we consider appropriate to keep the community safe.',
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export function renderTpl012(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const reportedEntityType = variables.reportedEntityType != null ? String(variables.reportedEntityType) : '';

  const tr = t(language);
  const entityLabel = escapeHtml(getReportedEntityLabel(reportedEntityType, language));

  const bodyHtml =
    renderEmailParagraph(tr.body1(entityLabel)) +
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
