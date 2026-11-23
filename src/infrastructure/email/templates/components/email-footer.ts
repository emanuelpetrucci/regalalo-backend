import { tokens } from '../../tokens/email-design-tokens';

const FOOTER_I18N = {
  es: {
    notYou: '¿No creaste esta cuenta?',
    contactSupport: 'Contactá con soporte',
    rights: 'Todos los derechos reservados.',
  },
  ca: {
    notYou: 'No has creat aquest compte?',
    contactSupport: 'Contacta amb el suport',
    rights: 'Tots els drets reservats.',
  },
  en: {
    notYou: "Didn't create this account?",
    contactSupport: 'Contact support',
    rights: 'All rights reserved.',
  },
} as const;

type FooterLocale = keyof typeof FOOTER_I18N;

function footerT(lang?: string) {
  return FOOTER_I18N[(lang as FooterLocale) ?? 'es'] ?? FOOTER_I18N.es;
}

export function renderEmailFooter(language?: string): string {
  const year = new Date().getFullYear();
  const i18n = footerT(language);
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td style="padding: 24px 0 0 0; border-top: 1px solid ${tokens.border}; text-align: center;">
      <p style="font-family: ${tokens.fontBody}; font-size: 13px; color: ${tokens.textMuted}; margin: 0 0 8px 0; padding: 0;">
        ${i18n.notYou}
        <a href="mailto:soporte@regalalo.org" style="color: ${tokens.primary}; text-decoration: underline;">${i18n.contactSupport}</a>
      </p>
      <p style="font-family: ${tokens.fontBody}; font-size: 12px; color: ${tokens.textMuted}; margin: 0; padding: 0;">
        © ${year} Regálalo. ${i18n.rights}
      </p>
    </td>
  </tr>
</table>`;
}
