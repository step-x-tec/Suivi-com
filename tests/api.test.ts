import { describe, expect, it } from 'vitest';
import { lireLimites, lireRoute, validerCloture } from '../supabase/functions/_shared/api';

const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';

describe('routage', () => {
  it('adresse Supabase ou /api/v1, avec ou sans « / » final', () => {
    expect(lireRoute('GET', '/functions/v1/api-v1/commerciaux')).toBe('commerciaux');
    expect(lireRoute('GET', '/api/v1/credit/soldes/')).toBe('credit/soldes');
    expect(lireRoute('GET', '/functions/v1/api-v1/rapports/resume')).toBe('rapports/resume');
    expect(lireRoute('POST', '/api/v1/clotures')).toBe('clotures');
  });
  it('mauvaise méthode ou route inconnue', () => {
    expect(lireRoute('DELETE', '/api/v1/commerciaux')).toBe('methode');
    expect(lireRoute('GET', '/api/v1/clotures')).toBe('methode');
    expect(lireRoute('GET', '/api/v1/utilisateurs')).toBe('inconnue');
    expect(lireRoute('GET', '/autre/chemin')).toBe('inconnue');
  });
});

describe('pagination', () => {
  it('valeurs par défaut, bornes et entrées absurdes', () => {
    expect(lireLimites(new URLSearchParams(''))).toEqual({ limit: 50, offset: 0 });
    expect(lireLimites(new URLSearchParams('limit=500&offset=-3'))).toEqual({ limit: 200, offset: 0 });
    expect(lireLimites(new URLSearchParams('limit=0'))).toEqual({ limit: 1, offset: 0 });
    expect(lireLimites(new URLSearchParams('limit=abc&offset=12.5'))).toEqual({ limit: 50, offset: 0 });
    expect(lireLimites(new URLSearchParams('limit=25&offset=100'))).toEqual({ limit: 25, offset: 100 });
  });
});

describe('validation d\'une clôture', () => {
  const ok = { commercial_id: U1, method: 'rest', lines: [{ attribution_id: U2, saisie: 40, defauts: 2 }], divers: [{ label: ' Déplacement ', montant: 1500 }] };
  it('accepte une requête valide et normalise (défauts à 0, libellé nettoyé)', () => {
    const r = validerCloture({ ...ok, lines: [{ attribution_id: U2, saisie: 10 }] });
    expect(r).toEqual({ ok: true, valeur: { commercial_id: U1, method: 'rest', lines: [{ attribution_id: U2, saisie: 10, defauts: 0 }],
      divers: [{ label: 'Déplacement', montant: 1500 }], note: null } });
    expect(validerCloture(ok).ok).toBe(true);
  });
  it.each([
    [null, 'Corps JSON'], [{ ...ok, commercial_id: 'x' }, 'commercial_id'], [{ ...ok, method: 'autre' }, 'method'],
    [{ ...ok, lines: [] }, 'au moins une ligne'], [{ ...ok, lines: [{ attribution_id: U2, saisie: -1 }] }, 'saisie'],
    [{ ...ok, lines: [{ attribution_id: U2, saisie: 1.5 }] }, 'saisie'], [{ ...ok, lines: [{ attribution_id: U2, saisie: 1, defauts: -2 }] }, 'defauts'],
    [{ ...ok, lines: [{ attribution_id: U2, saisie: 1 }, { attribution_id: U2, saisie: 2 }] }, 'déjà présente'],
    [{ ...ok, divers: [{ label: '', montant: 5 }] }, 'label'], [{ ...ok, divers: [{ label: 'x', montant: -5 }] }, 'montant'],
    [{ ...ok, note: 'x'.repeat(501) }, 'note']
  ])('refuse %j', (corps, fragment) => {
    const r = validerCloture(corps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toContain(fragment);
  });
});
