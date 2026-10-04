// Calculs des rapports (purs, testés). Les montants arrivent de Postgres en texte ou nombre.
const n = (v: number | string | null | undefined) => Number(v ?? 0);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type CodePeriode = 'jour' | 'semaine' | 'mois' | 'trimestre' | 'annee';

export function periode(code: CodePeriode, now = new Date()) {
  const fin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let debut = new Date(fin);
  if (code === 'semaine') debut.setDate(fin.getDate() - ((fin.getDay() + 6) % 7)); // lundi
  else if (code === 'mois') debut = new Date(fin.getFullYear(), fin.getMonth(), 1);
  else if (code === 'trimestre') debut = new Date(fin.getFullYear(), Math.floor(fin.getMonth() / 3) * 3, 1);
  else if (code === 'annee') debut = new Date(fin.getFullYear(), 0, 1);
  return { du: iso(debut), au: iso(fin) };
}

export interface ClotureR {
  id: string; commercial_id: string; created_at: string;
  brut: number | string; commissions: number | string; divers: number | string; net_final: number | string;
  commerciaux?: { nom: string; groupe_id: string | null } | null;
}
export interface AttrR {
  commercial_id: string; nom: string; prix: number | string; qty_initial: number; qty_rest: number;
  commerciaux?: { nom: string; groupe_id: string | null } | null;
}

export const tauxEcoulement = (a: AttrR[]) => {
  const init = a.reduce((s, x) => s + x.qty_initial, 0);
  const rest = a.reduce((s, x) => s + x.qty_rest, 0);
  return init > 0 ? ((init - rest) / init) * 100 : 0;
};

export function totauxClotures(cl: ClotureR[]) {
  return {
    nb: cl.length,
    brut: cl.reduce((s, c) => s + n(c.brut), 0),
    commissions: cl.reduce((s, c) => s + n(c.commissions), 0),
    divers: cl.reduce((s, c) => s + n(c.divers), 0),
    net: cl.reduce((s, c) => s + n(c.net_final), 0)
  };
}

export function parCommercial(cl: ClotureR[], attrs: AttrR[]) {
  const map = new Map<string, { id: string; nom: string; nb: number; ventes: number; commissions: number; net: number; derniere: string }>();
  for (const c of cl) {
    const r = map.get(c.commercial_id) ??
      { id: c.commercial_id, nom: c.commerciaux?.nom ?? '—', nb: 0, ventes: 0, commissions: 0, net: 0, derniere: '' };
    r.nb++; r.ventes += n(c.brut); r.commissions += n(c.commissions); r.net += n(c.net_final);
    if (c.created_at > r.derniere) r.derniere = c.created_at;
    map.set(c.commercial_id, r);
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      tauxCommission: r.ventes > 0 ? (r.commissions / r.ventes) * 100 : 0,
      ecoulement: tauxEcoulement(attrs.filter((a) => a.commercial_id === r.id))
    }))
    .sort((a, b) => b.ventes - a.ventes);
}

export function parGroupe(cl: ClotureR[], groupes: { id: string; nom: string }[]) {
  const noms = new Map(groupes.map((g) => [g.id, g.nom]));
  const map = new Map<string, { groupe: string; nb: number; ventes: number; commissions: number; net: number }>();
  for (const c of cl) {
    const gid = c.commerciaux?.groupe_id ?? '';
    const r = map.get(gid) ?? { groupe: noms.get(gid) ?? 'Sans groupe', nb: 0, ventes: 0, commissions: 0, net: 0 };
    r.nb++; r.ventes += n(c.brut); r.commissions += n(c.commissions); r.net += n(c.net_final);
    map.set(gid, r);
  }
  return [...map.values()].sort((a, b) => b.ventes - a.ventes);
}

export function inventaire(attrs: AttrR[]) {
  const map = new Map<string, { nom: string; stock: number; vendus: number; restants: number; valeur: number }>();
  for (const a of attrs) {
    const k = a.nom.trim().toLowerCase();
    const r = map.get(k) ?? { nom: a.nom.trim(), stock: 0, vendus: 0, restants: 0, valeur: 0 };
    r.stock += a.qty_initial; r.vendus += a.qty_initial - a.qty_rest; r.restants += a.qty_rest;
    r.valeur += a.qty_rest * n(a.prix);
    map.set(k, r);
  }
  return [...map.values()]
    .map((r) => ({ ...r, rotation: r.stock > 0 ? (r.vendus / r.stock) * 100 : 0 }))
    .sort((a, b) => b.vendus - a.vendus);
}
