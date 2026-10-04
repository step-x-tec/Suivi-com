import { describe, expect, it } from 'vitest';
import { alertesStock, chaleur, ilYaJours, retards, serieJournaliere, tauxRecouvrement, ventesParArticle, ventesParCommercial, ventesParGroupe } from '../src/lib/dashboard';
import { toutCharger } from '../src/lib/pagination';

const AUJ = new Date(2026, 9, 4); // 4 octobre 2026

describe('tableau de bord', () => {
  it('série de 30 jours complète, jours vides à 0', () => {
    const s = serieJournaliere([{ created_at: '2026-10-04T08:00:00Z', net_final: 1000 }, { created_at: '2026-10-04T15:00:00Z', net_final: '500' },
      { created_at: '2026-09-05T08:00:00Z', net_final: 200 }, { created_at: '2026-08-01T08:00:00Z', net_final: 999 }], 30, AUJ);
    expect(s).toHaveLength(30);
    expect(s[0].jour).toBe('2026-09-05');
    expect(s[29]).toEqual({ jour: '2026-10-04', net: 1500 });
    expect(s[0].net).toBe(200);
    expect(s.reduce((t, x) => t + x.net, 0)).toBe(1700); // la clôture d'août est hors fenêtre
    expect(ilYaJours(29, AUJ)).toBe('2026-09-05');
  });
  it('stock bas', () => {
    const a = alertesStock([{ qty_initial: 100, qty_rest: 5 }, { qty_initial: 100, qty_rest: 50 }, { qty_initial: 5, qty_rest: 0 }, { qty_initial: 10, qty_rest: 0 }]);
    expect(a).toEqual([{ qty_initial: 10, qty_rest: 0 }, { qty_initial: 100, qty_rest: 5 }]);
  });
  it('retards de règlement > 30 jours', () => {
    const soldes = [{ commercial_id: 'a', nom: 'Kofi', solde: 5000 }, { commercial_id: 'b', nom: 'Ama', solde: 9000 },
      { commercial_id: 'c', nom: 'Edem', solde: 100 }, { commercial_id: 'd', nom: 'Yao', solde: -50 }];
    const dernier = new Map([['a', '2026-08-20'], ['c', '2026-09-30']]);
    const premiere = new Map([['b', '2026-08-01T10:00:00Z'], ['d', '2026-01-01T10:00:00Z']]);
    const r = retards(soldes, dernier, premiere, AUJ);
    expect(r.map((x) => x.nom)).toEqual(['Ama', 'Kofi']); // Edem payé récemment, Yao est créditeur
    expect(r[0]).toMatchObject({ jours: 64, jamaisPaye: true });
    expect(r[1]).toMatchObject({ jours: 45, jamaisPaye: false });
  });
  it('taux de recouvrement', () => {
    expect(tauxRecouvrement([{ total_clotures: 1000, total_remises: 400, total_avances: 100 }, { total_clotures: 1000, total_remises: 0, total_avances: 0 }])).toBe(25);
    expect(tauxRecouvrement([])).toBe(0);
  });
});

const L = (a: string, m: number, c: number, com: string, g: string | null) => ({ article_nom: a, montant: m, commission: c, commercial_id: com, groupe_id: g });
const lignes = [L('Ticket 1h', 1000, 100, 'a', 'g1'), L('Ticket 1h', 500, 50, 'b', null), L('Recharge', 300, 30, 'a', 'g1'), L('Pass', 100, 10, 'b', null)];

describe('ventes détaillées', () => {
  it('répartition par article avec regroupement « Autres »', () => {
    const r = ventesParArticle(lignes, 2);
    expect(r.map((x) => [x.nom, x.ventes])).toEqual([['Ticket 1h', 1500], ['Recharge', 300], ['Autres', 100]]);
    expect(r.reduce((t, x) => t + x.part, 0)).toBeCloseTo(100);
    expect(ventesParArticle([], 5)).toEqual([]);
  });
  it('par commercial et par groupe', () => {
    const c = ventesParCommercial(lignes, new Map([['a', 'Kofi'], ['b', 'Ama']]));
    expect(c.map((x) => [x.nom, x.ventes, x.commissions])).toEqual([['Kofi', 1300, 130], ['Ama', 600, 60]]);
    const g = ventesParGroupe(lignes, [{ id: 'g1', nom: 'Lomé' }]);
    expect(g).toEqual([{ groupe: 'Lomé', ventes: 1300, commissions: 130 }, { groupe: 'Sans groupe', ventes: 600, commissions: 60 }]);
  });
  it('carte de chaleur : 12 semaines, jours futurs vides', () => {
    // vendredi 2 octobre 2026
    const h = chaleur([{ created_at: '2026-10-02T09:00:00Z' }, { created_at: '2026-10-02T15:00:00Z' }, { created_at: '2026-09-30T09:00:00Z' }, { created_at: '2025-01-01T09:00:00Z' }], 12, new Date(2026, 9, 2));
    expect(h.colonnes).toHaveLength(12);
    const derniere = h.colonnes[11];
    expect(derniere[0].date).toBe('2026-09-28'); // lundi
    expect(derniere[4]).toEqual({ date: '2026-10-02', n: 2, futur: false });
    expect(derniere[2].n).toBe(1);
    expect(derniere[5].futur).toBe(true);
    expect(h.max).toBe(2);
  });
});

describe('pagination', () => {
  it('recharge toutes les pages jusqu\'à la dernière, même au-delà de 1000 lignes', async () => {
    const total = 2500, appels: number[][] = [];
    const lignes = await toutCharger<number>(async (de, a) => {
      appels.push([de, a]);
      return { data: Array.from({ length: Math.max(0, Math.min(a, total - 1) - de + 1) }, (_, i) => de + i), error: null };
    });
    expect(lignes).toHaveLength(2500);
    expect(appels).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it('remonte une erreur au lieu de renvoyer des données partielles', async () => {
    await expect(toutCharger(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom');
  });
});
