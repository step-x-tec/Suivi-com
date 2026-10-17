// Espace d'administration STEP-X : état d'abonnement et recherche (purs, testés).
export interface EntrepriseAdmin {
  id: string; nom: string; email: string | null; phone: string | null; pays: string | null;
  plan: string; plan_effectif: string; renouvellement: string | null; cree_le: string;
}
export type Gravite = 'ok' | 'attention' | 'alerte' | 'neutre';

const jourUtc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

export function joursAvant(date: string, aujourdhui = new Date()): number {
  const [y, m, j] = date.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, j) - jourUtc(aujourdhui)) / 86_400_000);
}

export function etatAbonnement(e: Pick<EntrepriseAdmin, 'plan' | 'plan_effectif' | 'renouvellement'>, aujourdhui = new Date()): { libelle: string; gravite: Gravite } {
  if (e.plan === 'free') return { libelle: 'Gratuit', gravite: 'neutre' };
  if (!e.renouvellement) return { libelle: 'Sans échéance (activé à la main)', gravite: 'ok' };
  const j = joursAvant(e.renouvellement, aujourdhui);
  if (e.plan_effectif === 'free') return { libelle: `Expiré depuis ${-j} j : limites du plan Gratuit appliquées`, gravite: 'alerte' };
  if (j < 0) return { libelle: `Échéance dépassée de ${-j} j (délai de grâce)`, gravite: 'alerte' };
  if (j <= 7) return { libelle: `Expire dans ${j} j`, gravite: 'attention' };
  return { libelle: `Actif, encore ${j} j`, gravite: 'ok' };
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function filtrerEntreprises<T extends EntrepriseAdmin>(liste: T[], q: string, plan = ''): T[] {
  const t = norm(q.trim());
  return liste.filter((e) => (!plan || e.plan_effectif === plan) &&
    (!t || norm(`${e.nom} ${e.email ?? ''} ${e.phone ?? ''} ${e.pays ?? ''}`).includes(t)));
}
