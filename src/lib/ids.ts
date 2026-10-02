import type { CollectionEntry } from 'astro:content';

/**
 * Gli id di guide e moduli devono essere unici in tutto il sito: sono la
 * chiave con cui verranno agganciati i feedback. Un duplicato (es. una
 * guida creata con "Duplica" in Decap) fa fallire la build con un errore
 * che indica i file coinvolti.
 */
export function assertUniqueIds(guide: CollectionEntry<'guide'>[]): void {
  const seen = new Map<string, string>();
  const duplicati: string[] = [];

  const check = (id: string | undefined, where: string) => {
    if (!id) return;
    const prev = seen.get(id);
    if (prev) duplicati.push(`"${id}" in ${prev} e ${where}`);
    else seen.set(id, where);
  };

  for (const entry of guide) {
    check(entry.data.id, entry.id);
    entry.data.moduli.forEach((m, i) => check(m.id, `${entry.id} › moduli[${i}]`));
  }

  if (duplicati.length > 0) {
    throw new Error(`Id duplicati nelle guide:\n- ${duplicati.join('\n- ')}`);
  }
}

/** Ancora stabile per un modulo: l'id se c'è, altrimenti la posizione. */
export function moduloAnchor(id: string | undefined, index: number): string {
  return `modulo-${id ?? index + 1}`;
}
