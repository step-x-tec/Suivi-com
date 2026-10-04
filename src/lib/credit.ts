// Logique du module Crédit. Convention (identique à la vue SQL solde_commercial) :
// solde > 0 = le commercial doit ; débit = augmente le solde, crédit = le diminue.
export type TypeReglement = 'remise' | 'avance' | 'frais' | 'retour' | 'ajustement' | 'autre';
export type Sens = 'credit' | 'debit';

export const LIBELLES: Record<TypeReglement, string> = {
  remise: '💰 Remise', avance: '💳 Avance reçue', frais: '🧾 Frais à payer',
  retour: '📦 Retour articles', ajustement: '⚙ Ajustement', autre: '📝 Autre'
};

export function effet(type: TypeReglement, sens: Sens | null | undefined, montant: number) {
  switch (type) {
    case 'frais': return { debit: montant, credit: 0 };
    case 'ajustement': return sens === 'debit' ? { debit: montant, credit: 0 } : { debit: 0, credit: montant };
    case 'autre': return { debit: 0, credit: 0 }; // sans effet sur le solde
    default: return { debit: 0, credit: montant }; // remise, avance, retour
  }
}

// Variation du solde (débit - crédit) produite par une liste de règlements, ex. ceux en attente d'envoi
export const impactReglements = (rows: { type: TypeReglement; sens?: Sens | null; montant: number | string }[]) =>
  rows.reduce((t, r) => { const e = effet(r.type, r.sens, Number(r.montant)); return t + e.debit - e.credit; }, 0);

export interface Mouvement {
  id: string; kind: 'cloture' | 'reglement'; date: string; tri: string;
  libelle: string; debit: number; credit: number; solde?: number;
}

export function mouvements(
  clotures: { id: string; reference: string; net_final: number | string; created_at: string }[],
  reglements: { id: string; type: TypeReglement; sens: Sens | null; montant: number | string;
    mode?: string | null; reference?: string | null; note?: string | null; date_reglement: string; created_at: string }[]
): Mouvement[] {
  const list: Mouvement[] = [
    ...clotures.map((c) => {
      const n = Number(c.net_final);
      return { id: c.id, kind: 'cloture' as const, date: c.created_at, tri: c.created_at,
        libelle: `Clôture ${c.reference}`, debit: n >= 0 ? n : 0, credit: n < 0 ? -n : 0 };
    }),
    ...reglements.map((r) => {
      const e = effet(r.type, r.sens, Number(r.montant));
      const detail = [r.mode, r.reference, r.note].filter(Boolean).join(' · ');
      return { id: r.id, kind: 'reglement' as const, date: r.date_reglement, tri: r.created_at,
        libelle: LIBELLES[r.type].replace(/^\S+\s/, '') + (detail ? ` (${detail})` : ''), ...e };
    })
  ].sort((a, b) => a.tri.localeCompare(b.tri));

  let cumul = 0;
  for (const m of list) { cumul += m.debit - m.credit; m.solde = cumul; }
  return list;
}

export const totaux = (m: Mouvement[]) => {
  const debit = m.reduce((s, x) => s + x.debit, 0);
  const credit = m.reduce((s, x) => s + x.credit, 0);
  return { debit, credit, solde: debit - credit };
};

export const statutSolde = (s: number) => (s > 0 ? 'debiteur' : s < 0 ? 'crediteur' : 'solde');

// Chargement commun (fiche crédit + relevé)
export async function chargerCompte(supabase: any, id: string) {
  const [c, s, k, r] = await Promise.all([
    supabase.from('commerciaux').select('id, nom, code, telephone, zone').eq('id', id).maybeSingle(),
    supabase.from('solde_commercial').select('*').eq('commercial_id', id).maybeSingle(),
    supabase.from('clotures').select('id, reference, net_final, created_at')
      .eq('commercial_id', id).eq('status', 'validee'),
    supabase.from('reglements').select('*').eq('commercial_id', id)
  ]);
  return { c: c.data, solde: s.data, clotures: k.data ?? [], reglements: r.data ?? [] };
}
