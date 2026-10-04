// Libellés et prix pour l'affichage. Les LIMITES réelles viennent de la base (rpc usage_plan).
export const GRILLE = [
  { id: 'free', nom: 'Gratuit', prix: 0, resume: '3 commerciaux · 20 clôtures/mois' },
  { id: 'starter', nom: 'Starter', prix: 2500, resume: '10 commerciaux · clôtures illimitées · export PDF' },
  { id: 'pro', nom: 'Pro', prix: 5000, resume: '50 commerciaux · 3 membres d\'équipe' },
  { id: 'business', nom: 'Business', prix: 12000, resume: 'Commerciaux illimités · 10 membres d\'équipe' }
] as const;

export const libelleMax = (m: number | null | undefined) => (m === null || m === undefined ? 'illimité' : String(m));
export const pleine = (usage: number, max: number | null | undefined) =>
  max !== null && max !== undefined && usage >= max;
export const pctUsage = (usage: number, max: number | null | undefined) =>
  max ? Math.min(100, Math.round((usage / max) * 100)) : 0;

export type Periode = 'mensuel' | 'annuel';
// Annuel = 10 mois de prix mensuel (identique à public.tarif_plan en base)
export const prixPlan = (prixMensuel: number, periode: Periode) => (periode === 'annuel' ? prixMensuel * 10 : prixMensuel);
