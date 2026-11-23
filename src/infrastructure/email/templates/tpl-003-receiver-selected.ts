import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';
import { env } from '../../../config/env';
import { getConditionLabel } from './condition-labels';

const TRANSLATIONS = {
  es: {
    subject: '¡Fuiste seleccionado/a como receptor!',
    preheader: '¡Buenas noticias! Fuiste seleccionado/a para recibir un objeto.',
    title: '¡Fuiste seleccionado/a como receptor!',
    body1: (title: string, condition: string) => `¡Fuiste seleccionado/a como receptor para «${title}» (${condition})!`,
    body3: (deadline: string) => `La entrega debe coordinarse antes del ${deadline}. Entrá a la app para ver el canal de contacto del donante.`,
    cta: 'Ver en la app',
  },
  ca: {
    subject: "Has estat seleccionat/da com a receptor!",
    preheader: "Bones notícies! Has estat seleccionat/da per rebre un objecte.",
    title: "Has estat seleccionat/da com a receptor!",
    body1: (title: string, condition: string) => `Has estat seleccionat/da com a receptor per a «${title}» (${condition})!`,
    body3: (deadline: string) => `El lliurament s'ha de coordinar abans del ${deadline}. Entra a l'app per veure el canal de contacte del donant.`,
    cta: "Veure a l'app",
  },
  en: {
    subject: "You've been selected as receiver!",
    preheader: "Good news! You've been selected to receive an item.",
    title: "You've been selected as receiver!",
    body1: (title: string, condition: string) => `You've been selected as receiver for «${title}» (${condition})!`,
    body3: (deadline: string) => `The handover must be arranged before ${deadline}. Open the app to see the donor's contact channel.`,
    cta: 'View in app',
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

function formatDeadlineAt(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

export function renderTpl003(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const itemTitle = variables.itemTitle != null ? String(variables.itemTitle) : '';
  const itemCondition = variables.itemCondition != null ? String(variables.itemCondition) : '';
  const sessionDeadlineAt = variables.sessionDeadlineAt != null ? String(variables.sessionDeadlineAt) : '';
  const sessionId = variables.sessionId != null ? String(variables.sessionId) : '';
  const tr = t(language);

  const conditionLabel = getConditionLabel(itemCondition, language);
  const formattedDeadline = formatDeadlineAt(sessionDeadlineAt);

  const bodyHtml =
    renderEmailParagraph(tr.body1(itemTitle, conditionLabel)) +
    renderEmailParagraph(tr.body3(formattedDeadline));

  const baseUrl = env.APP_PUBLIC_URL.replace(/\/$/, '');
  const ctaHref = sessionId ? `${baseUrl}/entregas/${encodeURIComponent(sessionId)}` : baseUrl;

  const html = renderEmailLayout({
    preheader: tr.preheader,
    firstName,
    title: tr.title,
    bodyHtml,
    cta: { label: tr.cta, href: ctaHref },
    language,
  });

  return { subject: tr.subject, html };
}
