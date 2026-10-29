import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contenuConfig, ecrireConfig } from '../scripts/ecrire-config.mjs';

const T = new Date('2026-10-29T08:00:00Z');
describe('configuration publiée pour le diagnostic', () => {
  it('adresse Supabase valide : conservée sans « / » final ; version = 7 caractères du commit', () => {
    expect(contenuConfig({ PUBLIC_SUPABASE_URL: 'https://abc123.supabase.co/', COMMIT_REF: '56707afdeadbeef' }, T))
      .toEqual({ supabase_url: 'https://abc123.supabase.co', version: '56707af', genere_le: '2026-10-29T08:00:00.000Z' });
  });
  it('adresse absente ou étrange : signalée, jamais plantage', () => {
    expect(contenuConfig({}, T)).toMatchObject({ supabase_url: null, version: null });
    expect(contenuConfig({ PUBLIC_SUPABASE_URL: 'http://localhost:54321' }, T).supabase_url).toContain('adresse inattendue');
  });
  it('écrit static/config.json (et crée le dossier au besoin) sans y mettre de clé', () => {
    const racine = mkdtempSync(join(tmpdir(), 'commpro-'));
    ecrireConfig(racine, { PUBLIC_SUPABASE_URL: 'https://abc123.supabase.co', PUBLIC_SUPABASE_ANON_KEY: 'SECRET-NE-DOIT-PAS-APPARAITRE' });
    const fichier = join(racine, 'static', 'config.json');
    expect(existsSync(fichier)).toBe(true);
    const texte = readFileSync(fichier, 'utf-8');
    expect(texte).toContain('https://abc123.supabase.co');
    expect(texte).not.toContain('SECRET');
    rmSync(racine, { recursive: true, force: true });
  });
});
