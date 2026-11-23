import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';

const TRANSLATIONS = {
  es: {
    subject: 'Tu contraseña ha sido restablecida',
    preheader: 'Tu contraseña fue actualizada correctamente.',
    title: 'Contraseña restablecida',
    body1: 'Tu contraseña ha sido restablecida correctamente.',
    body2: 'Si no realizaste este cambio, contactá con soporte de inmediato.',
  },
  ca: {
    subject: 'La teva contrasenya ha estat restablerta',
    preheader: 'La teva contrasenya s\'ha actualitzat correctament.',
    title: 'Contrasenya restablerta',
    body1: 'La teva contrasenya ha estat restablerta correctament.',
    body2: 'Si no has realitzat aquest canvi, contacta amb el suport immediatament.',
  },
  en: {
    subject: 'Your password has been reset',
    preheader: 'Your password was updated successfully.',
    title: 'Password reset',
    body1: 'Your password has been reset successfully.',
    body2: 'If you did not make this change, contact support immediately.',
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export function renderTpl008(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const tr = t(language);

  const bodyHtml =
    renderEmailParagraph(tr.body1) +
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
