import { describe, expect, it } from 'vitest';
import { etatAbonnement, filtrerEntreprises, joursAvant, type EntrepriseAdmin } from '../src/lib/admin';

const AUJ = new Date(2026, 9, 14); // 14 octobre 2026
const E = (id: string, nom: string, plan: string, effectif: string, renouvellement: string | null, email: string | null = null): EntrepriseAdmin =>
  ({ id, nom, email, phone: null, pays: 'Togo', plan, plan_effectif: effectif, renouvellement, cree_le: '2026-10-01T00:00:00Z' });

describe('état d\'abonnement', () => {
  it('jours restants', () => {
    expect(joursAvant('2026-10-14', AUJ)).toBe(0);
    expect(joursAvant('2026-10-21', AUJ)).toBe(7);
    expect(joursAvant('2026-10-10', AUJ)).toBe(-4);
  });
  it('gratuit, sans échéance, actif, bientôt expiré, délai de grâce, expiré', () => {
    expect(etatAbonnement(E('1', 'a', 'free', 'free', null), AUJ)).toEqual({ libelle: 'Gratuit', gravite: 'neutre' });
    expect(etatAbonnement(E('2', 'a', 'pro', 'pro', null), AUJ).gravite).toBe('ok');
    expect(etatAbonnement(E('3', 'a', 'pro', 'pro', '2026-11-30'), AUJ)).toEqual({ libelle: 'Actif, encore 47 j', gravite: 'ok' });
    expect(etatAbonnement(E('4', 'a', 'pro', 'pro', '2026-10-18'), AUJ)).toEqual({ libelle: 'Expire dans 4 j', gravite: 'attention' });
    expect(etatAbonnement(E('5', 'a', 'pro', 'pro', '2026-10-12'), AUJ)).toMatchObject({ gravite: 'alerte', libelle: expect.stringContaining('délai de grâce') });
    expect(etatAbonnement(E('6', 'a', 'pro', 'free', '2026-10-01'), AUJ)).toMatchObject({ gravite: 'alerte', libelle: expect.stringContaining('Expiré depuis 13 j') });
  });
});

describe('recherche', () => {
  const L = [E('1', 'Réseau WiFi Lomé', 'pro', 'pro', null, 'kofi@x.tg'), E('2', 'Recharges Ama', 'free', 'free', null), E('3', 'Zone Kara', 'pro', 'free', '2026-09-01')];
  it('par nom (sans accent ni casse), e-mail, plan effectif', () => {
    expect(filtrerEntreprises(L, 'reseau').map((e) => e.id)).toEqual(['1']);
    expect(filtrerEntreprises(L, 'KOFI@').map((e) => e.id)).toEqual(['1']);
    expect(filtrerEntreprises(L, '', 'free').map((e) => e.id)).toEqual(['2', '3']); // le plan EFFECTIF : « Zone Kara » est expirée
    expect(filtrerEntreprises(L, 'togo').length).toBe(3);
    expect(filtrerEntreprises(L, 'inconnu')).toEqual([]);
  });
});
