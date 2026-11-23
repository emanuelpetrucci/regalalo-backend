import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';

const TRANSLATIONS = {
  es: {
    subject: 'Tu objeto lleva tiempo publicado',
    preheader: 'Tu objeto lleva tiempo publicado — aparece más abajo en el tablón.',
    title: 'Tu objeto aparece más abajo en el tablón',
    body1: (suffix: string) => `Tu objeto${suffix} lleva más de 7 días publicado sin que se elija un receptor.`,
    body2: 'Para dar visibilidad a publicaciones más recientes, aparece más abajo en el tablón.',
    body3: 'Si querés que lo vean más personas, podés actualizar la descripción o revisar el código postal.',
  },
  ca: {
    subject: 'El teu objecte fa temps que està publicat',
    preheader: 'El teu objecte fa temps que està publicat — apareix més avall al tauler.',
    title: 'El teu objecte apareix més avall al tauler',
    body1: (suffix: string) => `El teu objecte${suffix} fa més de 7 dies publicat sense que s'hagi triat un receptor.`,
    body2: 'Per donar visibilitat a publicacions més recents, apareix més avall al tauler.',
    body3: 'Si vols que el vegin més persones, pots actualitzar la descripció o revisar el codi postal.',
  },
  en: {
    subject: 'Your item has been listed for a while',
    preheader: 'Your item has been listed for a while — it appears lower on the board.',
    title: 'Your item appears lower on the board',
    body1: (suffix: string) => `Your item${suffix} has been listed for more than 7 days without a receiver being selected.`,
    body2: 'To give visibility to newer listings, it appears lower on the board.',
    body3: 'If you want more people to see it, you can update the description or review the postal code.',
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export function renderTpl007(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const itemTitle = variables.itemTitle != null ? String(variables.itemTitle) : '';
  const tr = t(language);

  const titleSuffix = itemTitle ? ` «${itemTitle}»` : '';

  const bodyHtml =
    renderEmailParagraph(tr.body1(titleSuffix)) +
    renderEmailParagraph(tr.body2) +
    renderEmailParagraph(tr.body3);

  const html = renderEmailLayout({
    preheader: tr.preheader,
    firstName,
    title: tr.title,
    bodyHtml,
    language,
  });

  return { subject: tr.subject, html };
}
