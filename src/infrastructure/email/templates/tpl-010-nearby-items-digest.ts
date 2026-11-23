import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';
import { escapeHtml } from './escape-html';
import { tokens } from '../tokens/email-design-tokens';
import { formatConditionLabelDisplay } from './condition-labels';

const TRANSLATIONS = {
  es: {
    subject: 'Nuevos objetos disponibles cerca tuyo',
    preheader: 'Objetos nuevos cerca tuyo — mirá el resumen y explorá en la app.',
    title: 'Nuevos objetos disponibles cerca tuyo',
    countSingular: '1 objeto nuevo',
    countPlural: (n: number) => `${n} objetos nuevos`,
    disponibleSingular: 'disponible',
    disponiblePlural: 'disponibles',
    intro: (countLabel: string, disponible: string, _count: number) =>
      `Hay ${countLabel} ${disponible} cerca tuyo en la última hora. Entrá a explorar y pedí el que te interese.`,
    cta: 'Explorar objetos',
    distanceLabel: 'km de vos',
  },
  ca: {
    subject: 'Nous objectes disponibles a prop teu',
    preheader: "Nous objectes a prop teu — mira el resum i explora a l'app.",
    title: 'Nous objectes disponibles a prop teu',
    countSingular: '1 objecte nou',
    countPlural: (n: number) => `${n} objectes nous`,
    disponibleSingular: 'disponible',
    disponiblePlural: 'disponibles',
    intro: (countLabel: string, disponible: string, _count: number) =>
      `Hi ha ${countLabel} ${disponible} a prop teu en l'última hora. Entra a explorar i demana el que t'interessi.`,
    cta: 'Explorar objectes',
    distanceLabel: 'km de tu',
  },
  en: {
    subject: 'New items available near you',
    preheader: 'New items near you — check the summary and explore in the app.',
    title: 'New items available near you',
    countSingular: '1 new item',
    countPlural: (n: number) => `${n} new items`,
    disponibleSingular: 'available',
    disponiblePlural: 'available',
    intro: (countLabel: string, _disponible: string, count: number) =>
      `There ${count === 1 ? 'is' : 'are'} ${countLabel} near you in the last hour. Start exploring and request the one you like.`,
    cta: 'Explore items',
    distanceLabel: 'km from you',
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export type DigestItemVariable = {
  itemId: string;
  title: string;
  condition: string;
  distanceKm: number;
  imageUrl?: string;
};

function parseDigestItems(itemsJson: string): DigestItemVariable[] {
  try {
    const parsed = JSON.parse(itemsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DigestItemVariable =>
        item != null &&
        typeof item === 'object' &&
        typeof (item as DigestItemVariable).title === 'string' &&
        typeof (item as DigestItemVariable).distanceKm === 'number',
    );
  } catch {
    return [];
  }
}

function renderDigestItemsList(items: DigestItemVariable[], language?: string): string {
  if (items.length === 0) return '';
  const tr = t(language);

  const rows = items
    .map(item => {
      const title = escapeHtml(item.title);
      const distance = escapeHtml(String(item.distanceKm));
      const conditionLabel = escapeHtml(formatConditionLabelDisplay(item.condition, language));
      const metaParts = [conditionLabel, `~${distance} ${tr.distanceLabel}`].filter(Boolean);
      const metaLine = metaParts.join(' · ');
      const imageBlock = item.imageUrl
        ? `<img src="${escapeHtml(item.imageUrl)}" alt="${title}" width="64" height="64" style="border-radius: 4px; object-fit: cover; display: block; margin-right: 12px;" />`
        : '';
      return `<tr>
        <td style="padding: 12px 0; border-bottom: 1px solid ${tokens.border};">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation">
            <tr>
              ${imageBlock ? `<td valign="top">${imageBlock}</td>` : ''}
              <td valign="top" style="font-family: ${tokens.fontBody}; font-size: 15px; color: ${tokens.textPrimary};">
                <strong>${title}</strong><br />
                <span style="color: ${tokens.textMuted}; font-size: 13px;">${metaLine}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join('');

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 8px 0 16px 0;">
    ${rows}
  </table>`;
}

export function renderTpl010(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
  const firstName = variables.firstName != null ? String(variables.firstName) : '';
  const appUrl = variables.appUrl != null ? String(variables.appUrl) : '';
  const itemsJson = variables.itemsJson != null ? String(variables.itemsJson) : '[]';
  const items = parseDigestItems(itemsJson);
  const displayCount = items.length;
  const tr = t(language);

  const countLabel = displayCount === 1 ? tr.countSingular : tr.countPlural(displayCount);
  const disponibleWord = displayCount === 1 ? tr.disponibleSingular : tr.disponiblePlural;

  const bodyHtml =
    renderEmailParagraph(tr.intro(countLabel, disponibleWord, displayCount)) +
    renderDigestItemsList(items, language);

  const exploreUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/explorar` : appUrl;

  const html = renderEmailLayout({
    preheader: tr.preheader,
    firstName,
    title: tr.title,
    bodyHtml,
    cta: exploreUrl ? { label: tr.cta, href: exploreUrl } : undefined,
    language,
  });

  return { subject: tr.subject, html };
}
