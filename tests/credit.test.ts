import { describe, expect, it } from 'vitest';
import { effet, mouvements, totaux, statutSolde } from '../src/lib/credit';
import { toCsv } from '../src/lib/csv';

const reg = (id: string, type: any, montant: number, sens: any = null, t = '2026-10-02T10:00:00Z') =>
  ({ id, type, sens, montant, date_reglement: t.slice(0, 10), created_at: t });

describe('crédit', () => {
  it('effet de chaque type de règlement', () => {
    expect(effet('remise', null, 10)).toEqual({ debit: 0, credit: 10 });
    expect(effet('frais', null, 10)).toEqual({ debit: 10, credit: 0 });
    expect(effet('ajustement', 'debit', 10)).toEqual({ debit: 10, credit: 0 });
    expect(effet('ajustement', 'credit', 10)).toEqual({ debit: 0, credit: 10 });
    expect(effet('autre', null, 10)).toEqual({ debit: 0, credit: 0 });
  });
  it('le solde cumulé suit la formule du cahier des charges', () => {
    const m = mouvements(
      [{ id: 'c1', reference: 'REC-1', net_final: 100000, created_at: '2026-10-01T08:00:00Z' }],
      [reg('1', 'remise', 40000, null, '2026-10-01T09:00:00Z'), reg('2', 'avance', 10000, null, '2026-10-01T10:00:00Z'),
       reg('3', 'frais', 5000, null, '2026-10-01T11:00:00Z'), reg('4', 'retour', 2000, null, '2026-10-01T12:00:00Z'),
       reg('5', 'ajustement', 1000, 'debit', '2026-10-01T13:00:00Z'), reg('6', 'ajustement', 500, 'credit', '2026-10-01T14:00:00Z'),
       reg('7', 'autre', 9999, null, '2026-10-01T15:00:00Z')]
    );
    expect(totaux(m).solde).toBe(53500);
    expect(m.at(-1)?.solde).toBe(53500);
    expect(statutSolde(53500)).toBe('debiteur');
  });
  it('clôture à net négatif = crédit', () => {
    const m = mouvements([{ id: 'c', reference: 'R', net_final: -300, created_at: '2026-10-01T08:00:00Z' }], []);
    expect(totaux(m).solde).toBe(-300);
  });
});

describe('csv', () => {
  it('échappe guillemets, points-virgules et retours ligne', () => {
    expect(toCsv([['a;b', 'c"d', 1, null]])).toBe('\ufeff"a;b";"c""d";1;');
  });
});
