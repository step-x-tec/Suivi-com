import { describe, expect, it } from 'vitest';
import { inventaire, parCommercial, parGroupe, periode, tauxEcoulement, totauxClotures } from '../src/lib/rapports';

const cl = (id: string, cid: string, nom: string, g: string | null, brut: number, comm: number, div: number, t = '2026-10-01T10:00:00Z') =>
  ({ id, commercial_id: cid, created_at: t, brut, commissions: comm, divers: div, net_final: brut - comm - div,
     commerciaux: { nom, groupe_id: g } });
const at = (cid: string, nom: string, prix: number, init: number, rest: number) =>
  ({ commercial_id: cid, nom, prix, qty_initial: init, qty_rest: rest });

describe('rapports', () => {
  const clotures = [cl('1', 'a', 'Kofi', 'g1', 1000, 100, 0), cl('2', 'a', 'Kofi', 'g1', 500, 50, 25, '2026-10-02T10:00:00Z'),
    cl('3', 'b', 'Ama', null, 3000, 300, 0)];
  const attrs = [at('a', 'Ticket 1h', 100, 100, 40), at('b', 'Ticket 1h', 100, 50, 0), at('b', 'Recharge', 500, 10, 10)];

  it('totaux', () => {
    expect(totauxClotures(clotures)).toEqual({ nb: 3, brut: 4500, commissions: 450, divers: 25, net: 4025 });
  });
  it('classement par commercial', () => {
    const r = parCommercial(clotures, attrs);
    expect(r.map((x) => x.nom)).toEqual(['Ama', 'Kofi']);
    expect(r[1]).toMatchObject({ nb: 2, ventes: 1500, commissions: 150, net: 1325, derniere: '2026-10-02T10:00:00Z' });
    expect(r[1].tauxCommission).toBeCloseTo(10);
    expect(r[1].ecoulement).toBeCloseTo(60);
  });
  it('par groupe', () => {
    expect(parGroupe(clotures, [{ id: 'g1', nom: 'Lomé' }]).map((g) => [g.groupe, g.ventes])).toEqual([['Sans groupe', 3000], ['Lomé', 1500]]);
  });
  it('inventaire consolidé par article', () => {
    const inv = inventaire(attrs);
    expect(inv[0]).toMatchObject({ nom: 'Ticket 1h', stock: 150, vendus: 110, restants: 40, valeur: 4000 });
    expect(inv[0].rotation).toBeCloseTo(73.33, 1);
    expect(tauxEcoulement(attrs)).toBeCloseTo((110 / 160) * 100);
  });
  it('périodes', () => {
    const d = new Date(2026, 9, 2); // vendredi 2 octobre 2026
    expect(periode('jour', d)).toEqual({ du: '2026-10-02', au: '2026-10-02' });
    expect(periode('semaine', d).du).toBe('2026-09-28');
    expect(periode('mois', d).du).toBe('2026-10-01');
    expect(periode('trimestre', d).du).toBe('2026-10-01');
    expect(periode('annee', d).du).toBe('2026-01-01');
  });
});
