import { tokens } from '../../tokens/email-design-tokens';
import { escapeHtml } from '../escape-html';

export function renderEmailParagraph(text: string): string {
  return `<p style="font-family: ${tokens.fontBody}; font-size: 16px; line-height: 1.6; color: ${tokens.textSecondary}; margin: 0 0 16px 0; padding: 0;">${escapeHtml(text)}</p>`;
}
