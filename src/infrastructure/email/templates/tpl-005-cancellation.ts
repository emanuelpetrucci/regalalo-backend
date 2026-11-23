import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';

const TRANSLATIONS = {
  es: {
    subject: 'Actualización sobre el objeto que ibas a recibir',
    preheader: 'El donante canceló el objeto. La sesión de entrega fue cerrada.',
    title: 'El objeto fue cancelado',
    body1: (title: string) => `El donante canceló el objeto «${title}».`,
    body2: 'La sesión de entrega fue cerrada. Si te interesan objetos similares, seguí explorando la plataforma.',
  },
  ca: {
    subject: "Actualització sobre l'objecte que anaves a rebre",
    preheader: "El donant ha cancel·lat l'objecte. La sessió de lliurament ha estat tancada.",
    title: "L'objecte ha estat cancel·lat",
    body1: (title: string) => `El donant ha cancel·lat l'objecte «${title}».`,
    body2: "La sessió de lliurament ha estat tancada. Si t'interessen objectes similars, continua explorant la plataforma.",
  },
  en: {
    subject: 'Update on the item you were going to receive',
    preheader: 'The donor cancelled the item. The delivery session was closed.',
    title: 'Item cancelled',
    body1: (title: string) => `The donor cancelled the item «${title}».`,
    body2: "The delivery session was closed. If you're interested in similar items, keep exploring the platform.",
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export function renderTpl005(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const itemTitle = variables.itemTitle != null ? String(variables.itemTitle) : '';
  const tr = t(language);

  const bodyHtml =
    renderEmailParagraph(tr.body1(itemTitle)) +
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
