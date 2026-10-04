import { describe, expect, it } from 'vitest';
import { ICONES, tempsRelatif } from '../src/lib/notifications';

const MAINT = new Date('2026-10-04T12:00:00Z');
describe('notifications', () => {
  it('temps relatif en français', () => {
    expect(tempsRelatif('2026-10-04T11:59:40Z', MAINT)).toBe("à l'instant");
    expect(tempsRelatif('2026-10-04T11:55:00Z', MAINT)).toBe('il y a 5 min');
    expect(tempsRelatif('2026-10-04T09:00:00Z', MAINT)).toBe('il y a 3 h');
    expect(tempsRelatif('2026-10-03T00:00:00Z', MAINT)).toBe('hier');
    expect(tempsRelatif('2026-10-01T12:00:00Z', MAINT)).toBe('il y a 3 j');
    expect(tempsRelatif('2026-09-01T12:00:00Z', MAINT)).not.toMatch(/^il y a/);
  });
  it('une icône par type produit par la base', () => {
    for (const t of ['attribution', 'cloture', 'reglement', 'stock', 'retard', 'paiement']) expect(ICONES[t]).toBeTruthy();
  });
});
