import { z } from '../../zod';

/** Idiomas soportados por la app (Transloco + perfil). */
export const APP_PREFERRED_LANGUAGES = ['es', 'ca', 'en'] as const;

export type AppPreferredLanguage = (typeof APP_PREFERRED_LANGUAGES)[number];

export const preferredLanguageSchema = z.enum(APP_PREFERRED_LANGUAGES);
