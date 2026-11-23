import { tokens } from '../../tokens/email-design-tokens';
import { renderEmailButton } from '../components/email-button';
import { renderEmailHeading } from '../components/email-heading';
import { renderEmailFooter } from '../components/email-footer';
import { escapeHtml } from '../escape-html';

const LAYOUT_I18N = {
  es: { greeting: 'Hola,', fallbackLabel: 'O copia este enlace:' },
  ca: { greeting: 'Hola,', fallbackLabel: 'O copia aquest enllaç:' },
  en: { greeting: 'Hello,', fallbackLabel: 'Or copy this link:' },
} as const;

type LayoutLocale = keyof typeof LAYOUT_I18N;

function layoutT(lang?: string) {
  return LAYOUT_I18N[(lang as LayoutLocale) ?? 'es'] ?? LAYOUT_I18N.es;
}

export type EmailLayoutInput = {
  preheader: string;
  firstName: string;
  title: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
  fallbackLink?: string;
  language?: string;
};

export function renderEmailLayout(input: EmailLayoutInput): string {
  const { preheader, firstName, title, bodyHtml, cta, fallbackLink, language } = input;
  const i18n = layoutT(language);

  const ctaHtml = cta ? renderEmailButton(cta) : '';

  let fallbackHtml = '';
  if (fallbackLink) {
    if (process.env['NODE_ENV'] === 'production' && !/^https:\/\//i.test(fallbackLink)) throw new Error(`fallbackLink must be an https URL`);
    const safeUrl = escapeHtml(fallbackLink);
    fallbackHtml = `<p style="font-family: ${tokens.fontBody}; font-size: 14px; color: ${tokens.textMuted}; text-align: center; margin: 0 0 16px 0; padding: 0;">
        ${escapeHtml(i18n.fallbackLabel)} <a href="${safeUrl}" style="color: ${tokens.primary}; text-decoration: underline; word-break: break-all;">${safeUrl}</a>
      </p>`;
  }

  const htmlLang = escapeHtml(language || 'es');

  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Regálalo</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${tokens.background}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <!-- Preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(preheader)}</div>

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
    style="background-color: ${tokens.background};">
    <tr>
      <td align="center" style="padding: 24px 16px;">

        <!-- Email container (max 600px) -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation"
          style="max-width: 600px; width: 100%; background-color: ${tokens.surface}; border-radius: 8px; border: 1px solid ${tokens.border};">

          <!-- Header -->
          <tr>
            <td style="background-color: ${tokens.primary}; border-radius: 8px 8px 0 0; padding: 24px; text-align: center;">
              <span style="font-family: ${tokens.fontDisplay}; font-size: 22px; font-weight: 700; color: ${tokens.surface}; letter-spacing: -0.3px;">
                Regálalo
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px 8px 40px;">

              <!-- Saludo -->
              <p style="font-family: ${tokens.fontBody}; font-size: 16px; color: ${tokens.textSecondary}; margin: 0 0 16px 0; padding: 0;">
                ${escapeHtml(i18n.greeting)} ${escapeHtml(firstName)}
              </p>

              <!-- Titular -->
              ${renderEmailHeading(title)}

              <!-- Cuerpo -->
              ${bodyHtml}

              <!-- CTA primario -->
              ${ctaHtml}

              <!-- Fallback link -->
              ${fallbackHtml}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 40px 24px 40px;">
              ${renderEmailFooter(language)}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
