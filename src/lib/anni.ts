import { ANNI_DI_CORSO } from '../content/config';

// Anni di corso ↔ slug degli URL (/anni/iv-anno/).

export type Anno = (typeof ANNI_DI_CORSO)[number];

/** "IV Anno" → "iv-anno" */
export const annoSlug = (anno: Anno): string => anno.toLowerCase().replace(/\s+/g, '-');

/** "iv-anno" → "IV Anno" */
export const annoDaSlug = (slug: string): Anno | undefined => ANNI_DI_CORSO.find((a) => annoSlug(a) === slug);

/** "IV Anno" → "IV" */
export const numeroRomano = (anno: Anno): string => anno.split(' ')[0];

export const annoHref = (anno: Anno): string => `/anni/${annoSlug(anno)}/`;

/** Nome di View Transition condiviso fra casella del mondo e banner dell'anno. */
export const vtMondo = (anno: Anno): string => `mondo-${annoSlug(anno)}`;

export { ANNI_DI_CORSO };
