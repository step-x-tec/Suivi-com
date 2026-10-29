// Écrit static/config.json à chaque construction : l'adresse Supabase réellement intégrée dans l'application (publique, sans clé)
// et la version. La page /diagnostic.html la lit pour dire QUEL projet Supabase l'application interroge.
// (Une adresse restée sur un ancien projet supprimé fait « Failed to fetch » partout, sans autre indice.)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function contenuConfig(env, maintenant = new Date()) {
  const brut = (env.PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  return {
    supabase_url: /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(brut) ? brut : brut ? `(adresse inattendue : ${brut.slice(0, 60)})` : null,
    version: (env.COMMIT_REF ?? '').slice(0, 7) || null,
    genere_le: maintenant.toISOString()
  };
}

export function ecrireConfig(racine, env = process.env) {
  const dossier = join(racine, 'static');
  mkdirSync(dossier, { recursive: true });
  const config = contenuConfig(env);
  writeFileSync(join(dossier, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  return config;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const c = ecrireConfig(join(fileURLToPath(import.meta.url), '..', '..'));
  console.log(`config.json écrit : ${c.supabase_url ?? 'ADRESSE SUPABASE ABSENTE'}`);
}
