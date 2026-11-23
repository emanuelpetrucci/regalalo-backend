import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';

const TRANSLATIONS = {
  es: {
    subject: '¡Bienvenido a Regálalo!',
    preheader: 'Bienvenido/a a Regálalo.',
    title: '¡Bienvenido/a a Regálalo!',
    body: [
      'Tu cuenta ya está lista.',
      'En Regálalo podés regalar lo que no usás y pedir objetos cerca tuyo, sin dinero de por medio. La comunidad se organiza con participación justa: quien más aporta, más fácil recibe.',
    ],
  },
  ca: {
    subject: 'Benvingut/da a Regálalo!',
    preheader: 'Benvingut/da a Regálalo.',
    title: 'Benvingut/da a Regálalo!',
    body: [
      'El teu compte ja està llest.',
      "A Regálalo pots regalar el que no uses i demanar objectes a prop teu, sense diners de per mig. La comunitat s'organitza amb participació justa: qui més aporta, més fàcilment rep.",
    ],
  },
  en: {
    subject: 'Welcome to Regálalo!',
    preheader: 'Welcome to Regálalo.',
    title: 'Welcome to Regálalo!',
    body: [
      'Your account is ready.',
      "On Regálalo you can give away what you don't use and request items near you, with no money involved. The community is organized with fair participation: those who contribute more, receive more easily.",
    ],
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export function renderTpl001(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const tr = t(language);

  const bodyHtml = tr.body.map(renderEmailParagraph).join('');

  const html = renderEmailLayout({
    preheader: tr.preheader,
    firstName,
    title: tr.title,
    bodyHtml,
    language,
  });

  return { subject: tr.subject, html };
}
