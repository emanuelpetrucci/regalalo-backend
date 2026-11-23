import { renderEmailLayout } from './layout/email-layout';
import { renderEmailParagraph } from './components/email-paragraph';

const TRANSLATIONS = {
  es: {
    subject: 'Aviso sobre tu actividad en Regálalo',
    preheader: 'Revisamos tu actividad en la plataforma.',
    title: 'Aviso sobre tu actividad',
    body1: 'Hemos revisado tu actividad en Regálalo y, tras nuestra revisión, consideramos que cierto contenido o comportamiento podría no ajustarse a las normas de la comunidad.',
    body2: 'Te invitamos a revisar las normas de la plataforma para seguir construyendo juntos una comunidad positiva para todos.',
  },
  ca: {
    subject: "Avís sobre la teva activitat a Regálalo",
    preheader: "Revisem la teva activitat a la plataforma.",
    title: "Avís sobre la teva activitat",
    body1: "Hem revisat la teva activitat a Regálalo i, després de la nostra revisió, considerem que cert contingut o comportament podria no ajustar-se a les normes de la comunitat.",
    body2: "Et convidem a revisar les normes de la plataforma per continuar construint junts una comunitat positiva per a tothom.",
  },
  en: {
    subject: 'Notice about your activity on Regálalo',
    preheader: 'We reviewed your activity on the platform.',
    title: 'Notice about your activity',
    body1: "We have reviewed your activity on Regálalo and, following our review, we believe that certain content or behaviour may not comply with community guidelines.",
    body2: "We invite you to review the platform guidelines so we can continue building a positive community together.",
  },
} as const;

type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;

export function renderTpl013(variables: Record<string, string | number>, language?: string): { subject: string; html: string } {
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
