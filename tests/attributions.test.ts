import { describe, expect, it } from 'vitest';
import { filtrer, paginer, trier, valeurVendue, type Attr } from '../src/lib/attributions';

const A = (id: string, nom: string, com: string, g: string | null, pct: number, init: number, rest: number, prix: number, date: string): Attr =>
  ({ id, nom, commercial_id: com, pct, qty_initial: init, qty_rest: rest, prix, created_at: date, commerciaux: { nom: com.toUpperCase(), groupe_id: g } });
const L = [
  A('1', 'Ticket 1h', 'kofi', 'g1', 10, 100, 40, 500, '2026-10-01'),
  A('2', 'Ticket 1h', 'ama', 'g2', 15, 50, 0, 500, '2026-10-03'),
  A('3', 'Recharge', 'kofi', 'g1', 5, 10, 10, 1000, '2026-10-02'),
  A('4', 'Récharge Pro', 'edem', null, 12, 20, 5, 2000, '2026-09-30')
];

describe('filtres', () => {
  it('par commercial, groupe, article (sans tenir compte de la casse ni des accents), texte libre', () => {
    expect(filtrer(L, { commercial: 'kofi' }).map((a) => a.id)).toEqual(['1', '3']);
    expect(filtrer(L, { groupe: 'g2' }).map((a) => a.id)).toEqual(['2']);
    expect(filtrer(L, { article: 'TICKET 1H' }).map((a) => a.id)).toEqual(['1', '2']);
    expect(filtrer(L, { q: 'recharge' }).map((a) => a.id)).toEqual(['3', '4']); // « Récharge » trouvé sans accent
    expect(filtrer(L, { q: 'ama' }).map((a) => a.id)).toEqual(['2']); // aussi sur le nom du commercial
  });
  it('filtres croisés et aucun filtre', () => {
    expect(filtrer(L, { commercial: 'kofi', article: 'Recharge' }).map((a) => a.id)).toEqual(['3']);
    expect(filtrer(L, { commercial: 'ama', groupe: 'g1' })).toEqual([]);
    expect(filtrer(L, {})).toHaveLength(4);
  });
});

describe('tri', () => {
  it('par date, commission, restant, valeur vendue', () => {
    expect(trier(L, 'date', 'desc').map((a) => a.id)).toEqual(['2', '3', '1', '4']);
    expect(trier(L, 'commission', 'asc').map((a) => a.id)).toEqual(['3', '1', '4', '2']);
    expect(trier(L, 'restant', 'desc').map((a) => a.id)).toEqual(['1', '3', '4', '2']); // 40, 10, 5, 0
    expect(valeurVendue(L[0])).toBe(30000);
    expect(trier(L, 'valeur', 'desc').map((a) => a.id)).toEqual(['1', '4', '2', '3']); // 30000 et 30000 (ordre d'origine conservé), 25000, 0
  });
  it('par texte (accents français) et stable à égalité', () => {
    expect(trier(L, 'commercial', 'asc').map((a) => a.id)).toEqual(['2', '4', '1', '3']);
    expect(trier(L, 'article', 'asc').map((a) => a.id)).toEqual(['3', '4', '1', '2']);
  });
  it('ne modifie pas la liste d\'origine', () => {
    const copie = L.map((a) => a.id);
    trier(L, 'valeur', 'asc');
    expect(L.map((a) => a.id)).toEqual(copie);
  });
});

describe('pagination', () => {
  const nombres = Array.from({ length: 60 }, (_, i) => i);
  it('découpe en pages et borne la page demandée', () => {
    expect(paginer(nombres, 0, 25)).toMatchObject({ page: 0, pages: 3, total: 60 });
    expect(paginer(nombres, 2, 25).items).toHaveLength(10);
    expect(paginer(nombres, 9, 25).page).toBe(2);
    expect(paginer(nombres, -4, 25).page).toBe(0);
    expect(paginer([], 0, 50)).toEqual({ items: [], page: 0, pages: 1, total: 0 });
  });
});
