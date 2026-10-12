import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Les fonctions déployées depuis le tableau de bord Supabase sont des fichiers UNIQUES : elles contiennent une copie des
// modules partagés (supabase/functions/_shared, qui sont testés). Ce test garantit que les copies sont restées identiques.
const lire = (chemin: string) => readFileSync(new URL(`../supabase/functions/${chemin}`, import.meta.url), 'utf-8');
const sansImports = (t: string) => t.split('\n').filter((l) => !l.startsWith('import ')).join('\n').trim();

const FONCTIONS: Record<string, string[]> = {
  'api-v1': ['cors', 'api'],
  'envoyer-notifications': ['email'],
  'paiement-creer': ['cors', 'auth', 'decision', 'fedapay'],
  'paiement-verifier': ['cors', 'auth', 'decision', 'fedapay'],
  'paiement-webhook': ['decision', 'fedapay']
};

describe('fonctions serveur autonomes', () => {
  for (const [nom, modules] of Object.entries(FONCTIONS)) {
    it(`${nom} : aucun import relatif, copies des modules identiques`, () => {
      const fichier = lire(`${nom}/index.ts`);
      expect(fichier).not.toMatch(/^import .*_shared/m); // les commentaires peuvent citer _shared/, pas les imports
      expect(fichier).not.toMatch(/from '\.{1,2}\//);
      for (const m of modules) expect(fichier).toContain(sansImports(lire(`_shared/${m}.ts`)));
    });
  }
  it('inviter-membre est déjà un fichier unique', () => {
    expect(lire('inviter-membre/index.ts')).not.toMatch(/from '\.{1,2}\//);
  });
});
