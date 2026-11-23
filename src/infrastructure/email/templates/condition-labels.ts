/** Etiquetas de estado de ítem por idioma (sync con feed / TPL-003 / TPL-010). */
export const CONDITION_LABELS: Record<string, Record<string, string>> = {
  es: { new: 'nuevo', like_new: 'como nuevo', good: 'buen estado', fair: 'estado regular' },
  ca: { new: 'nou', like_new: 'com a nou', good: 'bon estat', fair: 'estat regular' },
  en: { new: 'new', like_new: 'like new', good: 'good condition', fair: 'fair condition' },
};

export function getConditionLabel(condition: string, language?: string): string {
  const lang = language ?? 'es';
  const map = CONDITION_LABELS[lang] ?? CONDITION_LABELS['es'];
  return (map ?? {})[condition] ?? condition;
}

/** Primera letra en mayúscula para meta de filas en digest (TPL-010). */
export function formatConditionLabelDisplay(condition: string, language?: string): string {
  const label = getConditionLabel(condition, language);
  if (!label) return '';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Etiquetas legibles para los motivos de reporte por idioma. */
const REPORT_REASON_LABELS: Record<string, Record<string, string>> = {
  es: {
    contenido_inadecuado: 'Contenido inadecuado',
    fraude_o_enganio: 'Fraude o engaño',
    spam: 'Spam',
    objeto_ilegal: 'Objeto ilegal',
    objeto_peligroso: 'Objeto peligroso',
    'información_falsa': 'Información falsa',
    comportamiento_abusivo: 'Comportamiento abusivo',
    otro: 'Otro',
  },
  ca: {
    contenido_inadecuado: 'Contingut inadequat',
    fraude_o_enganio: 'Frau o engany',
    spam: 'Spam',
    objeto_ilegal: 'Objecte il·legal',
    objeto_peligroso: 'Objecte perillós',
    'información_falsa': 'Informació falsa',
    comportamiento_abusivo: 'Comportament abusiu',
    otro: 'Altre',
  },
  en: {
    contenido_inadecuado: 'Inappropriate content',
    fraude_o_enganio: 'Fraud or deception',
    spam: 'Spam',
    objeto_ilegal: 'Illegal item',
    objeto_peligroso: 'Dangerous item',
    'información_falsa': 'False information',
    comportamiento_abusivo: 'Abusive behaviour',
    otro: 'Other',
  },
};

export function getReportReasonLabel(reason: string, language?: string): string {
  const lang = language ?? 'es';
  const map = REPORT_REASON_LABELS[lang] ?? REPORT_REASON_LABELS['es'];
  return (map ?? {})[reason] ?? reason;
}

/** Etiquetas del tipo de entidad reportada por idioma (usa tipos raw 'item'/'user'). */
const REPORTED_ENTITY_LABELS: Record<string, Record<string, string>> = {
  es: { item: 'un objeto', user: 'otro usuario' },
  ca: { item: 'un objecte', user: 'un altre usuari' },
  en: { item: 'an item', user: 'another user' },
};

export function getReportedEntityLabel(type: string, language?: string): string {
  const lang = language ?? 'es';
  const map = REPORTED_ENTITY_LABELS[lang] ?? REPORTED_ENTITY_LABELS['es'];
  return (map ?? {})[type] ?? (type ? `"${type}"` : 'un contenido');
}
