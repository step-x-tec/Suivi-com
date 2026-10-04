import { describe, expect, it } from 'vitest';
import { decider } from '../supabase/functions/_shared/decision';

const p = { montant: 5000, devise: 'XOF' };
describe('décision de paiement', () => {
  it('active un paiement approuvé au bon montant (nombre ou texte)', () => {
    expect(decider({ status: 'approved', amount: 5000, currency: { iso: 'XOF' } }, p).action).toBe('activer');
    expect(decider({ status: 'approved', amount: '5000' }, p).action).toBe('activer');
    expect(decider({ status: 'transferred', amount: 5000 }, p).action).toBe('activer');
  });
  it('signale une anomalie si montant ou devise diffèrent', () => {
    expect(decider({ status: 'approved', amount: 100 }, p).action).toBe('anomalie');
    expect(decider({ status: 'approved', amount: 5000, currency: { iso: 'USD' } }, p).action).toBe('anomalie');
  });
  it('refuse / annule / attend', () => {
    expect(decider({ status: 'declined' }, p).action).toBe('refuser');
    expect(decider({ status: 'canceled' }, p).action).toBe('annuler');
    expect(decider({ status: 'pending' }, p).action).toBe('attendre');
    expect(decider(null, p).action).toBe('attendre');
  });
});
