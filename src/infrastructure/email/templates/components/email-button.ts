import { tokens } from '../../tokens/email-design-tokens';
import { escapeHtml } from '../escape-html';

type ButtonInput = {
  label: string;
  href: string;
};

export function renderEmailButton({ label, href }: ButtonInput): string {
  if (process.env['NODE_ENV'] === 'production' && !/^https:\/\//i.test(href)) throw new Error(`cta.href must be an https URL`);
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td align="center" style="padding: 24px 0 16px 0;">
      <a href="${safeHref}" target="_blank"
        style="display: inline-block; background-color: ${tokens.primary}; color: ${tokens.surface}; font-family: ${tokens.fontBody}; font-size: 16px; font-weight: 600; line-height: 44px; min-height: 44px; padding: 0 32px; text-decoration: none; border-radius: 6px; mso-padding-alt: 0;">
        <!--[if mso]><i style="letter-spacing: 32px; mso-char-type: overhang;">&nbsp;</i><![endif]-->
        ${safeLabel}
        <!--[if mso]><i style="letter-spacing: 32px; mso-char-type: overhang;">&nbsp;</i><![endif]-->
      </a>
    </td>
  </tr>
</table>`;
}
