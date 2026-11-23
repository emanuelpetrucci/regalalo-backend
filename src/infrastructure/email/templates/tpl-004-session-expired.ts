import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';

const TRANSLATIONS = {
  es: {
    subject: 'La sesión de entrega de tu objeto ha expirado',
    preheader: 'La sesión de entrega venció sin confirmación.',
    title: 'La sesión de entrega expiró',
    body1: (titlePart: string) => `La sesión de entrega para ${titlePart} venció sin que se confirmara la entrega.`,
    body2: 'El objeto vuelve a estar disponible en el tablón para nuevas solicitudes.',
    itemFallback: 'tu objeto',
  },
  ca: {
    subject: "La sessió de lliurament del teu objecte ha expirat",
    preheader: 'La sessió de lliurament ha vençut sense confirmació.',
    title: 'La sessió de lliurament ha expirat',
    body1: (titlePart: string) => `La sessió de lliurament per a ${titlePart} ha vençut sense confirmar el lliurament.`,
    body2: "L'objecte torna a estar disponible al tauler per a noves sol·licituds.",
    itemFallback: "el teu objecte",
  },
  en: {
    subject: 'Your delivery session has expired',
    preheader: 'The delivery session expired without confirmation.',
    title: 'Delivery session expired',
    body1: (titlePart: string) => `The delivery session for ${titlePart} expired without delivery being confirmed.`,
    body2: 'The item is now available on the board for new requests.',
    itemFallback: 'your item',
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export function renderTpl004(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const itemTitle = variables.itemTitle != null ? String(variables.itemTitle) : '';
  const tr = t(language);
  const titlePart = itemTitle ? `«${itemTitle}»` : tr.itemFallback;

  const bodyHtml =
    renderEmailParagraph(tr.body1(titlePart)) +
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
