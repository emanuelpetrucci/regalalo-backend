import { tokens } from '../../tokens/email-design-tokens';
import { escapeHtml } from '../escape-html';

export function renderEmailHeading(text: string): string {
  return `<h1 style="font-family: ${tokens.fontDisplay}; font-size: 24px; font-weight: 700; color: ${tokens.textPrimary}; margin: 0 0 16px 0; padding: 0; line-height: 1.3;">${escapeHtml(text)}</h1>`;
}
