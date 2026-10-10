// Statistiques et tri de la liste des commerciaux (purs, testés).
export interface AttrStat { commercial_id: string; qty_initial: number; qty_rest: number; prix: number | string }
export interface Stats { nb: number; initial: number; restant: number; ecoulement: number; valeurStock: number }

export function statsAttributions(attrs: AttrStat[]): Map<string, Stats> {
  const m = new Map<string, Stats>();
  for (const a of attrs) {
    const s = m.get(a.commercial_id) ?? { nb: 0, initial: 0, restant: 0, ecoulement: 0, valeurStock: 0 };
    s.nb++; s.initial += a.qty_initial; s.restant += a.qty_rest; s.valeurStock += a.qty_rest * Number(a.prix);
    m.set(a.commercial_id, s);
  }
  for (const s of m.values()) s.ecoulement = s.initial > 0 ? ((s.initial - s.restant) / s.initial) * 100 : 0;
  return m;
}

export type CleTriCom = 'nom' | 'solde' | 'articles' | 'ecoulement';

// Tri stable : à valeur égale, l'ordre d'origine (alphabétique) est conservé
export function trierCommerciaux<T extends { id: string; nom: string }>(
  liste: T[], stats: Map<string, Stats>, soldes: Map<string, number>, cle: CleTriCom, sens: 'asc' | 'desc'
): T[] {
  const valeur = (c: T): string | number =>
    cle === 'nom' ? c.nom : cle === 'solde' ? soldes.get(c.id) ?? 0
    : cle === 'articles' ? stats.get(c.id)?.nb ?? 0 : stats.get(c.id)?.ecoulement ?? 0;
  const k = sens === 'asc' ? 1 : -1;
  return liste.map((c, i) => ({ c, i })).sort((x, y) => {
    const u = valeur(x.c), v = valeur(y.c);
    const r = typeof u === 'number' && typeof v === 'number' ? u - v : String(u).localeCompare(String(v), 'fr');
    return r !== 0 ? r * k : x.i - y.i;
  }).map((x) => x.c);
}

export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return '?';
  const lettre = (m: string) => Array.from(m)[0]?.toUpperCase() ?? '';
  return mots.length === 1 ? lettre(mots[0]) : lettre(mots[0]) + lettre(mots[mots.length - 1]);
}
