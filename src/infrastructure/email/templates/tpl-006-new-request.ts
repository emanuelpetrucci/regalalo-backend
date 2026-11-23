import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';
import { env } from '../../../config/env';

const TRANSLATIONS = {
  es: {
    subject: 'Tienes una nueva solicitud para tu objeto',
    preheader: 'Alguien solicitó tu objeto. Entrá a la app para elegir al receptor.',
    title: 'Nueva solicitud para tu objeto',
    body: (title: string) =>
      title
        ? `Un usuario solicitó tu objeto «${title}». Entrá a la app para ver los candidatos y elegir al receptor.`
        : 'Un usuario solicitó tu objeto. Entrá a la app para ver los candidatos y elegir al receptor.',
    cta: 'Ver candidatos',
  },
  ca: {
    subject: 'Tens una nova sol·licitud per al teu objecte',
    preheader: "Algú ha sol·licitat el teu objecte. Entra a l'app per triar el receptor.",
    title: 'Nova sol·licitud per al teu objecte',
    body: (title: string) =>
      title
        ? `Un usuari ha sol·licitat el teu objecte «${title}». Entra a l'app per veure els candidats i triar el receptor.`
        : "Un usuari ha sol·licitat el teu objecte. Entra a l'app per veure els candidats i triar el receptor.",
    cta: 'Veure candidats',
  },
  en: {
    subject: 'You have a new request for your item',
    preheader: 'Someone requested your item. Open the app to choose the receiver.',
    title: 'New request for your item',
    body: (title: string) =>
      title
        ? `A user requested your item «${title}». Open the app to see the candidates and choose the receiver.`
        : 'A user requested your item. Open the app to see the candidates and choose the receiver.',
    cta: 'View candidates',
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export function renderTpl006(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const itemTitle = variables.itemTitle != null ? String(variables.itemTitle) : '';
  const itemId = variables.itemId != null ? String(variables.itemId) : '';
  const tr = t(language);

  const bodyHtml = renderEmailParagraph(tr.body(itemTitle));

  const baseUrl = env.APP_PUBLIC_URL.replace(/\/$/, '');
  const ctaHref = itemId ? `${baseUrl}/items/${encodeURIComponent(itemId)}` : baseUrl;

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
