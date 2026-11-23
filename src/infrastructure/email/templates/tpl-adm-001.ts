import { tokens } from '../tokens/email-design-tokens';
import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';
import { escapeHtml } from './escape-html';

const OTP_EXPIRY_MINUTES = 10;

export function renderTplAdm001(variables: Record<string, string | number>, _language?: string): { subject: string; html: string } {
  const otp = String(variables.otp ?? '');
  const expiresInMinutes = typeof variables.expiresInMinutes === 'number'
    ? variables.expiresInMinutes
    : OTP_EXPIRY_MINUTES;

  const safeOtp = escapeHtml(otp);
  const bodyHtml =
    renderEmailParagraph('Usá el siguiente código para acceder al panel de administración.') +
    `<p style="font-family: ${tokens.fontBody}; font-size: 16px; line-height: 1.6; color: ${tokens.textSecondary}; margin: 0 0 16px 0; padding: 0;">Tu código de acceso es: <strong style="font-size: 24px; letter-spacing: 4px;">${safeOtp}</strong></p>` +
    renderEmailParagraph(`Este código vence en ${expiresInMinutes} minutos. No lo compartas con nadie.`);

  const html = renderEmailLayout({
    preheader: 'Tu código de acceso al panel de administración de Regálalo.',
    firstName: 'administrador',
    title: 'Código de acceso al panel',
    bodyHtml,
  });

  return {
    subject: 'Código de acceso al panel de administración — Regálalo',
    html,
  };
}
