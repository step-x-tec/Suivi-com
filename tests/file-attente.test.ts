import { describe, expect, it } from 'vitest';
import { traiter, type Action, type Resultat } from '../src/lib/file-attente';
import { impactReglements } from '../src/lib/credit';

const act = (id: string, t: string, erreur?: string): Action =>
  ({ id, user_id: 'u', table: 'reglements', payload: { id }, created_at: t, erreur });

function banc(reponses: Record<string, Resultat>) {
  const supprimes: string[] = [], refuses: Record<string, string> = {}, envoyes: string[] = [];
  return {
    supprimes, refuses, envoyes,
    envoyer: async (a: Action) => { envoyes.push(a.id); return reponses[a.id] ?? { ok: true as const }; },
    sortie: { supprimer: async (id: string) => { supprimes.push(id); }, refuser: async (id: string, e: string) => { refuses[id] = e; } }
  };
}

describe('file d\'attente hors ligne', () => {
  it('envoie dans l\'ordre chronologique et supprime ce qui est envoyé', async () => {
    const b = banc({});
    const r = await traiter([act('b', '2026-10-02T10:00:00Z'), act('a', '2026-10-01T10:00:00Z')], b.envoyer, b.sortie);
    expect(b.envoyes).toEqual(['a', 'b']);
    expect(b.supprimes).toEqual(['a', 'b']);
    expect(r).toEqual({ envoyes: 2, refuses: 0, reseau: false });
  });
  it('s\'arrête quand le réseau tombe et garde le reste en file', async () => {
    const b = banc({ b: { reseau: true } });
    const r = await traiter([act('a', '1'), act('b', '2'), act('c', '3')], b.envoyer, b.sortie);
    expect(b.envoyes).toEqual(['a', 'b']);
    expect(b.supprimes).toEqual(['a']);
    expect(r.reseau).toBe(true);
  });
  it('un refus du serveur est marqué sans bloquer les suivantes', async () => {
    const b = banc({ a: { erreur: 'refusé par la sécurité' } });
    const r = await traiter([act('a', '1'), act('b', '2')], b.envoyer, b.sortie);
    expect(b.refuses).toEqual({ a: 'refusé par la sécurité' });
    expect(b.supprimes).toEqual(['b']);
    expect(r).toEqual({ envoyes: 1, refuses: 1, reseau: false });
  });
  it('ne renvoie pas une action déjà refusée', async () => {
    const b = banc({});
    await traiter([act('a', '1', 'déjà refusée')], b.envoyer, b.sortie);
    expect(b.envoyes).toEqual([]);
  });
});

describe('impact des règlements en attente sur le solde', () => {
  it('remise = -, frais = +, ajustement selon le sens', () => {
    expect(impactReglements([{ type: 'remise', montant: 1000 }, { type: 'frais', montant: 300 },
      { type: 'ajustement', sens: 'debit', montant: 50 }, { type: 'autre', montant: 999 }])).toBe(-650);
  });
});
