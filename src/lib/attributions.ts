// Filtres, tri et pagination de la liste des attributions (purs, testés).
export interface Attr {
  id: string; commercial_id: string; nom: string; pct: number | string; prix: number | string;
  qty_initial: number; qty_rest: number; created_at: string;
  commerciaux?: { nom: string; groupe_id: string | null } | null;
}
export interface Filtres { commercial?: string; groupe?: string; article?: string; q?: string }
export type CleTri = 'date' | 'commercial' | 'article' | 'commission' | 'restant' | 'valeur';
export type Sens = 'asc' | 'desc';

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const valeurVendue = (a: Attr) => (a.qty_initial - a.qty_rest) * Number(a.prix);

export function filtrer(liste: Attr[], f: Filtres): Attr[] {
  const q = norm(f.q ?? ''), article = norm(f.article ?? '');
  return liste.filter((a) =>
    (!f.commercial || a.commercial_id === f.commercial) &&
    (!f.groupe || a.commerciaux?.groupe_id === f.groupe) &&
    (!article || norm(a.nom) === article) &&
    (!q || norm(`${a.nom} ${a.commerciaux?.nom ?? ''}`).includes(q)));
}

const valeurTri: Record<CleTri, (a: Attr) => string | number> = {
  date: (a) => a.created_at, commercial: (a) => norm(a.commerciaux?.nom ?? ''), article: (a) => norm(a.nom),
  commission: (a) => Number(a.pct), restant: (a) => a.qty_rest, valeur: (a) => valeurVendue(a)
};

// Tri stable : à valeur égale, l'ordre d'origine est conservé (les plus récentes d'abord)
export function trier(liste: Attr[], cle: CleTri, sens: Sens): Attr[] {
  const f = valeurTri[cle], k = sens === 'asc' ? 1 : -1;
  return liste.map((a, i) => ({ a, i })).sort((x, y) => {
    const u = f(x.a), v = f(y.a);
    const c = typeof u === 'number' && typeof v === 'number' ? u - v : String(u).localeCompare(String(v), 'fr');
    return c !== 0 ? c * k : x.i - y.i;
  }).map((x) => x.a);
}

export function paginer<T>(liste: T[], page: number, taille: number) {
  const pages = Math.max(1, Math.ceil(liste.length / taille));
  const courante = Math.min(Math.max(0, page), pages - 1);
  return { items: liste.slice(courante * taille, (courante + 1) * taille), page: courante, pages, total: liste.length };
}
