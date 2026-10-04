// Calculs du tableau de bord (purs, testés).
const n = (v: number | string | null | undefined) => Number(v ?? 0);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const jourLocal = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const ilYaJours = (nb: number, aujourdhui = new Date()) => {
  const d = jourLocal(aujourdhui);
  d.setDate(d.getDate() - nb);
  return iso(d);
};

// Net encaissable par jour sur les N derniers jours (les jours sans clôture valent 0)
export function serieJournaliere(
  clotures: { created_at: string; net_final: number | string }[], jours = 30, aujourdhui = new Date()
) {
  const serie = new Map<string, number>();
  for (let i = jours - 1; i >= 0; i--) serie.set(ilYaJours(i, aujourdhui), 0);
  for (const c of clotures) {
    const k = c.created_at.slice(0, 10);
    if (serie.has(k)) serie.set(k, (serie.get(k) ?? 0) + n(c.net_final));
  }
  return [...serie].map(([jour, net]) => ({ jour, net }));
}

// Stock bas : lot d'au moins `min` articles dont il reste `seuil` (10 %) ou moins
export function alertesStock<T extends { qty_initial: number; qty_rest: number }>(attrs: T[], seuil = 0.1, min = 10) {
  return attrs
    .filter((a) => a.qty_initial >= min && a.qty_rest <= a.qty_initial * seuil)
    .sort((a, b) => a.qty_rest / a.qty_initial - b.qty_rest / b.qty_initial);
}

// Débiteurs sans règlement depuis plus de `seuilJours` (à défaut de règlement : depuis la 1re clôture)
export function retards(
  soldes: { commercial_id: string; nom: string; solde: number | string }[],
  dernierReglement: Map<string, string>, premiereCloture: Map<string, string>,
  aujourdhui = new Date(), seuilJours = 30
) {
  const auj = jourLocal(aujourdhui).getTime();
  const out: { id: string; nom: string; solde: number; jours: number; jamaisPaye: boolean }[] = [];
  for (const s of soldes) {
    if (n(s.solde) <= 0) continue;
    const dernier = dernierReglement.get(s.commercial_id);
    const ref = dernier ?? premiereCloture.get(s.commercial_id)?.slice(0, 10);
    if (!ref) continue;
    const [y, m, d] = ref.split('-').map(Number);
    const jours = Math.floor((auj - new Date(y, m - 1, d).getTime()) / 86_400_000);
    if (jours > seuilJours) out.push({ id: s.commercial_id, nom: s.nom, solde: n(s.solde), jours, jamaisPaye: !dernier });
  }
  return out.sort((a, b) => b.solde - a.solde);
}

// Encaissé (remises + avances) rapporté au total des clôtures
export function tauxRecouvrement(
  soldes: { total_clotures: number | string; total_remises: number | string; total_avances: number | string }[]
) {
  const du = soldes.reduce((t, s) => t + n(s.total_clotures), 0);
  const encaisse = soldes.reduce((t, s) => t + n(s.total_remises) + n(s.total_avances), 0);
  return du > 0 ? Math.min(100, (encaisse / du) * 100) : 0;
}

// ---- Tableau de bord complet : ventes par article / commercial / groupe, carte de chaleur ----
export interface LigneVente {
  article_nom: string; montant: number | string; commission: number | string;
  commercial_id: string; groupe_id: string | null;
}

export function ventesParArticle(lignes: LigneVente[], max = 5) {
  const map = new Map<string, number>();
  for (const l of lignes) map.set(l.article_nom.trim(), (map.get(l.article_nom.trim()) ?? 0) + n(l.montant));
  const tri = [...map].map(([nom, ventes]) => ({ nom, ventes })).filter((x) => x.ventes > 0).sort((a, b) => b.ventes - a.ventes);
  const total = tri.reduce((t, x) => t + x.ventes, 0);
  const garde = tri.slice(0, max);
  const autres = tri.slice(max).reduce((t, x) => t + x.ventes, 0);
  if (autres > 0) garde.push({ nom: 'Autres', ventes: autres });
  return garde.map((x) => ({ ...x, part: total > 0 ? (x.ventes / total) * 100 : 0 }));
}

export function ventesParCommercial(lignes: LigneVente[], noms: Map<string, string>) {
  const map = new Map<string, { id: string; nom: string; ventes: number; commissions: number }>();
  for (const l of lignes) {
    const r = map.get(l.commercial_id) ?? { id: l.commercial_id, nom: noms.get(l.commercial_id) ?? '—', ventes: 0, commissions: 0 };
    r.ventes += n(l.montant); r.commissions += n(l.commission);
    map.set(l.commercial_id, r);
  }
  return [...map.values()].sort((a, b) => b.ventes - a.ventes);
}

export function ventesParGroupe(lignes: LigneVente[], groupes: { id: string; nom: string }[]) {
  const noms = new Map(groupes.map((g) => [g.id, g.nom]));
  const map = new Map<string, { groupe: string; ventes: number; commissions: number }>();
  for (const l of lignes) {
    const k = l.groupe_id ?? '';
    const r = map.get(k) ?? { groupe: noms.get(k) ?? 'Sans groupe', ventes: 0, commissions: 0 };
    r.ventes += n(l.montant); r.commissions += n(l.commission);
    map.set(k, r);
  }
  return [...map.values()].sort((a, b) => b.ventes - a.ventes);
}

// Activité par jour de la semaine : une colonne par semaine (lundi à dimanche), nombre de clôtures par jour
export function chaleur(clotures: { created_at: string }[], semaines = 12, aujourdhui = new Date()) {
  const fin = jourLocal(aujourdhui);
  const lundi = new Date(fin);
  lundi.setDate(fin.getDate() - ((fin.getDay() + 6) % 7));
  const debut = new Date(lundi);
  debut.setDate(lundi.getDate() - 7 * (semaines - 1));
  const compte = new Map<string, number>();
  for (const c of clotures) { const k = c.created_at.slice(0, 10); compte.set(k, (compte.get(k) ?? 0) + 1); }
  let max = 0;
  const colonnes: { date: string; n: number; futur: boolean }[][] = [];
  for (let w = 0; w < semaines; w++) {
    const col: { date: string; n: number; futur: boolean }[] = [];
    for (let j = 0; j < 7; j++) {
      const d = new Date(debut);
      d.setDate(debut.getDate() + 7 * w + j);
      const futur = d.getTime() > fin.getTime();
      const nb = futur ? 0 : compte.get(iso(d)) ?? 0;
      max = Math.max(max, nb);
      col.push({ date: iso(d), n: nb, futur });
    }
    colonnes.push(col);
  }
  return { colonnes, max };
}
