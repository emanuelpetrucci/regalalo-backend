import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';

const TRANSLATIONS = {
  es: {
    subject: 'Confirmá tu email y empezá en Regálalo',
    preheader: 'Un click y ya podés publicar, pedir o regalar lo que no vendés.',
    title: 'Confirmá tu email y empezá en Regálalo',
    body1: 'Confirmá tu dirección de email haciendo clic en el botón.',
    body2: (hours: number) => `Este enlace vence en ${hours} horas.`,
    cta: 'Confirmar mi email',
  },
  ca: {
    subject: 'Confirma el teu email i comença a Regálalo',
    preheader: 'Un clic i ja pots publicar, demanar o regalar el que no vens.',
    title: 'Confirma el teu email i comença a Regálalo',
    body1: "Confirma la teva adreça d'email fent clic al botó.",
    body2: (hours: number) => `Aquest enllaç caduca en ${hours} hores.`,
    cta: 'Confirmar el meu email',
  },
  en: {
    subject: 'Confirm your email and start on Regálalo',
    preheader: "One click and you can list, request or give away what you don't sell.",
    title: 'Confirm your email and start on Regálalo',
    body1: 'Confirm your email address by clicking the button.',
    body2: (hours: number) => `This link expires in ${hours} hours.`,
    cta: 'Confirm my email',
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export function renderTpl009(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const verificationLink = String(variables.verificationLink);
  const expiresInHours = Number(variables.expiresInHours) || 0;
  const tr = t(language);

  const bodyHtml =
    renderEmailParagraph(tr.body1) +
    renderEmailParagraph(tr.body2(expiresInHours));

  const html = renderEmailLayout({
    preheader: tr.preheader,
    firstName,
    title: tr.title,
    bodyHtml,
    cta: { label: tr.cta, href: verificationLink },
    fallbackLink: verificationLink,
    language,
  });

  return { subject: tr.subject, html };
}
