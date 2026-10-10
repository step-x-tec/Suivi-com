import { describe, expect, it } from 'vitest';
import { initiales, statsAttributions, trierCommerciaux } from '../src/lib/commerciaux';

const attrs = [
  { commercial_id: 'a', qty_initial: 100, qty_rest: 40, prix: 500 },
  { commercial_id: 'a', qty_initial: 50, qty_rest: 50, prix: 1000 },
  { commercial_id: 'b', qty_initial: 20, qty_rest: 0, prix: 300 }
];
const coms = [{ id: 'a', nom: 'Kofi' }, { id: 'b', nom: 'Ama' }, { id: 'c', nom: 'Édem' }];

describe('statistiques par commercial', () => {
  it('articles, stock, valeur du stock et taux d\'écoulement', () => {
    const s = statsAttributions(attrs);
    expect(s.get('a')).toMatchObject({ nb: 2, initial: 150, restant: 90, valeurStock: 40 * 500 + 50 * 1000 });
    expect(s.get('a')?.ecoulement).toBeCloseTo(40, 5);
    expect(s.get('b')?.ecoulement).toBe(100);
    expect(s.get('c')).toBeUndefined();
  });
});

describe('tri des commerciaux', () => {
  const stats = statsAttributions(attrs);
  const soldes = new Map([['a', 5000], ['b', -200], ['c', 0]]);
  it('par nom (accents français), solde, nombre d\'articles, écoulement', () => {
    expect(trierCommerciaux(coms, stats, soldes, 'nom', 'asc').map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(trierCommerciaux(coms, stats, soldes, 'solde', 'desc').map((c) => c.id)).toEqual(['a', 'c', 'b']);
    expect(trierCommerciaux(coms, stats, soldes, 'articles', 'desc').map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(trierCommerciaux(coms, stats, soldes, 'ecoulement', 'desc').map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });
  it('stable à égalité et sans modifier la liste d\'origine', () => {
    const memes = [{ id: 'x', nom: 'A' }, { id: 'y', nom: 'B' }, { id: 'z', nom: 'C' }];
    expect(trierCommerciaux(memes, new Map(), new Map(), 'articles', 'desc').map((c) => c.id)).toEqual(['x', 'y', 'z']);
    expect(memes.map((c) => c.id)).toEqual(['x', 'y', 'z']);
  });
});

describe('initiales', () => {
  it('première et dernière lettre, accents et cas limites', () => {
    expect(initiales('Kofi Mensah')).toBe('KM');
    expect(initiales('  ama  ')).toBe('A');
    expect(initiales('Jean Pierre Amegan')).toBe('JA');
    expect(initiales('édem agbo')).toBe('ÉA');
    expect(initiales('   ')).toBe('?');
  });
});
