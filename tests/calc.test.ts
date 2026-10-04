import { describe, expect, it } from 'vitest';
import { calcCloture, calcLigne } from '../src/lib/calc';

const base = { id: 'a', qtyAvant: 100, prix: 500, pct: 10, defauts: 0 };

describe('calcLigne', () => {
  it('méthode restants : vendus = avant - restants - défauts', () => {
    const r = calcLigne({ ...base, saisie: 40, defauts: 2 }, 'rest', 0);
    expect(r).toMatchObject({ ok: true, vend: 58, rest: 40, montant: 29000, commission: 2900, du: 26100 });
  });
  it('méthode vendus : restants = avant - vendus - défauts', () => {
    const r = calcLigne({ ...base, saisie: 30, defauts: 5 }, 'vend', 0);
    expect(r).toMatchObject({ ok: true, vend: 30, rest: 65, montant: 15000 });
  });
  it('refuse les quantités incohérentes', () => {
    expect(calcLigne({ ...base, qtyAvant: 10, saisie: 8, defauts: 5 }, 'rest', 0).ok).toBe(false);
    expect(calcLigne({ ...base, saisie: 120 }, 'vend', 0).ok).toBe(false);
  });
  it('arrondit la commission par ligne', () => {
    const l = { id: 'b', qtyAvant: 10, prix: 100, pct: 7.5, defauts: 0, saisie: 7 };
    expect(calcLigne(l, 'rest', 0).commission).toBe(23); // 22,5 -> 23 (CFA)
    expect(calcLigne(l, 'rest', 2).commission).toBe(22.5); // devises à 2 décimales
  });
});

describe('calcCloture', () => {
  it('net = brut - commissions - divers (défauts non redéduits)', () => {
    const c = calcCloture(
      [{ ...base, saisie: 40, defauts: 2 }, { ...base, id: 'b', qtyAvant: 50, prix: 1000, pct: 5, saisie: 20 }],
      'rest', [1500, 500], 'CFA'
    );
    expect(c.brut).toBe(29000 + 30000);
    expect(c.commissions).toBe(2900 + 1500);
    expect(c.divers).toBe(2000);
    expect(c.net).toBe(59000 - 4400 - 2000);
    expect(c.defauts).toBe(1000);
    expect(c.valid).toBe(true);
  });
  it('invalide si aucune ligne saisie', () => {
    expect(calcCloture([{ ...base, saisie: null }], 'rest', [], 'CFA').valid).toBe(false);
  });
});
