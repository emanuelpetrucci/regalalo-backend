import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';

const TRANSLATIONS = {
  es: {
    subject: 'Recuperá tu contraseña',
    preheader: 'Restablecé tu contraseña y volvé a acceder.',
    title: 'Restablecé tu contraseña',
    body1: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
    body2: (minutes: number) => `Este enlace vence en ${minutes} minutos.`,
    cta: 'Restablecer contraseña',
  },
  ca: {
    subject: 'Restableix la teva contrasenya',
    preheader: 'Restableix la teva contrasenya i torna a accedir.',
    title: 'Restableix la teva contrasenya',
    body1: "Hem rebut una sol·licitud per restablir la contrasenya del teu compte.",
    body2: (minutes: number) => `Aquest enllaç caduca en ${minutes} minuts.`,
    cta: 'Restablir contrasenya',
  },
  en: {
    subject: 'Reset your password',
    preheader: 'Reset your password and regain access.',
    title: 'Reset your password',
    body1: 'We received a request to reset your account password.',
    body2: (minutes: number) => `This link expires in ${minutes} minutes.`,
    cta: 'Reset password',
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export function renderTpl002(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const resetLink = String(variables.resetLink);
  const expiresInMinutes = Number(variables.expiresInMinutes) || 0;
  const tr = t(language);

  const bodyHtml =
    renderEmailParagraph(tr.body1) +
    renderEmailParagraph(tr.body2(expiresInMinutes));

  const html = renderEmailLayout({
    preheader: tr.preheader,
    firstName,
    title: tr.title,
    bodyHtml,
    cta: { label: tr.cta, href: resetLink },
    fallbackLink: resetLink,
    language,
  });

  return { subject: tr.subject, html };
}
