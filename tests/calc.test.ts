import { describe, expect, it } from 'vitest';
import { calcCloture, calcLigne } from '../src/lib/calc';

const base = { id: 'a', qtyAvant: 100, prix: 500, pct: 10, defauts: 0 };

describe('calcLigne (règles du prototype v1)', () => {
  it('méthode restants : vendus = avant − restants ; les défauts sont dans les vendus', () => {
    const r = calcLigne({ ...base, saisie: 40, defauts: 2 }, 'rest', 0);
    expect(r).toMatchObject({ ok: true, vend: 60, vendValides: 58, rest: 42, brutLigne: 30000, montant: 29000,
      commission: 2900, du: 26100, defautsValeur: 1000 });
  });
  it('méthode vendus : les défauts reviennent aussi en stock', () => {
    const r = calcLigne({ ...base, saisie: 30, defauts: 5 }, 'vend', 0);
    expect(r).toMatchObject({ ok: true, vend: 30, vendValides: 25, rest: 75, brutLigne: 15000, montant: 12500, defautsValeur: 2500 });
  });
  it('refuse les quantités incohérentes et les défauts supérieurs aux ventes', () => {
    expect(calcLigne({ ...base, saisie: 120 }, 'vend', 0).ok).toBe(false);
    expect(calcLigne({ ...base, saisie: 120 }, 'rest', 0).ok).toBe(false);
    expect(calcLigne({ ...base, qtyAvant: 10, saisie: 8, defauts: 5 }, 'rest', 0).ok).toBe(false);
  });
  it('arrondit la commission par ligne', () => {
    const l = { id: 'b', qtyAvant: 10, prix: 100, pct: 7.5, defauts: 0, saisie: 7 };
    expect(calcLigne(l, 'rest', 0).commission).toBe(23);
    expect(calcLigne(l, 'rest', 2).commission).toBe(22.5);
  });
});

// Reproduit à l'identique la boucle de validerClo() du prototype v1 et compare, sur des cas variés
function v1(qtyRest: number, prix: number, pct: number, val: number, defauts: number, method: 'rest' | 'vend') {
  const rest = method === 'rest' ? val : qtyRest - val;
  const vend = qtyRest - rest;
  if (vend < 0 || rest < 0) return null;
  const vendValides = Math.max(0, vend - defauts);
  const mont = vendValides * prix, comm = (mont * pct) / 100;
  return { vend, vendValides, brut: vend * prix, def: defauts * prix, comm, du: mont - comm, qtyRestApres: rest + defauts };
}

describe('fidélité au prototype v1', () => {
  it('mêmes quantités, brut, défauts et stock ; commissions à ±0,5 FCFA (arrondi par ligne)', () => {
    let graine = 12345, comparaisons = 0;
    const alea = (n: number) => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine % (n + 1); };
    for (let i = 0; i < 500; i++) {
      const qty = 1 + alea(300), prix = 50 * (1 + alea(40)), pct = [0, 5, 10, 12, 15, 20][alea(5)];
      const method = alea(1) ? 'rest' : 'vend', val = alea(qty), defauts = alea(20);
      const ref = v1(qty, prix, pct, val, defauts, method);
      if (!ref || defauts > ref.vend) continue; // le v1 ignore ces cas ; la v2 les refuse avec un message
      const r = calcLigne({ id: 'x', qtyAvant: qty, prix, pct, saisie: val, defauts }, method, 0);
      expect(r.ok).toBe(true);
      expect([r.vend, r.vendValides, r.brutLigne, r.defautsValeur, r.rest]).toEqual([ref.vend, ref.vendValides, ref.brut, ref.def, ref.qtyRestApres]);
      expect(Math.abs(r.commission - ref.comm)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(r.du - ref.du)).toBeLessThanOrEqual(0.5);
      comparaisons++;
    }
    expect(comparaisons).toBeGreaterThan(200);
  });
});

describe('calcCloture', () => {
  it('net = brut − commissions − défauts − divers (même présentation que le reçu v1)', () => {
    const c = calcCloture(
      [{ ...base, saisie: 40, defauts: 2 }, { ...base, id: 'b', qtyAvant: 50, prix: 1000, pct: 5, saisie: 20 }],
      'rest', [1500, 500], 'CFA'
    );
    expect(c.brut).toBe(30000 + 30000);
    expect(c.commissions).toBe(2900 + 1500);
    expect(c.defauts).toBe(1000);
    expect(c.divers).toBe(2000);
    expect(c.net).toBe(60000 - 4400 - 1000 - 2000);
    expect(c.valid).toBe(true);
  });
  it('le net peut être négatif (déductions supérieures au dû) : pas de plafonnement à 0', () => {
    expect(calcCloture([{ ...base, saisie: 99 }], 'rest', [5000], 'CFA').net).toBe(450 - 5000);
  });
  it('invalide si aucune ligne saisie', () => {
    expect(calcCloture([{ ...base, saisie: null }], 'rest', [], 'CFA').valid).toBe(false);
  });
});
