import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OBSOLETES, nettoyer } from '../scripts/nettoyer-obsoletes.mjs';

const fabrique = () => {
  const racine = mkdtempSync(join(tmpdir(), 'commpro-'));
  for (const f of [...OBSOLETES, 'src/routes/auth/confirm/+page.svelte', 'src/routes/+layout.ts']) {
    mkdirSync(join(racine, f, '..'), { recursive: true });
    writeFileSync(join(racine, f), '// test');
  }
  return racine;
};

describe('nettoyage des fichiers obsolètes avant la construction', () => {
  it('supprime les anciens fichiers serveur et garde les fichiers actuels', () => {
    const racine = fabrique();
    const supprimes = nettoyer(racine, () => {});
    expect(supprimes).toHaveLength(OBSOLETES.length);
    for (const f of OBSOLETES) expect(existsSync(join(racine, f))).toBe(false);
    expect(existsSync(join(racine, 'src/routes/auth/confirm/+page.svelte'))).toBe(true);
    expect(existsSync(join(racine, 'src/routes/+layout.ts'))).toBe(true);
    rmSync(racine, { recursive: true, force: true });
  });
  it('ne fait rien (et ne plante pas) quand tout est déjà propre', () => {
    const racine = mkdtempSync(join(tmpdir(), 'commpro-'));
    expect(nettoyer(racine, () => {})).toEqual([]);
    rmSync(racine, { recursive: true, force: true });
  });
});
