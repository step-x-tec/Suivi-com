// Supprime les fichiers d'anciennes versions qui ne doivent plus exister, AVANT la construction du site.
// Pourquoi : envoyer un nouveau dossier sur GitHub depuis le navigateur ajoute et remplace des fichiers, mais ne SUPPRIME jamais
// ceux qui ont disparu. Un reste d'ancienne version (rendu serveur, routes serveur…) fait échouer ou casse le site statique,
// et Netlify continue alors de servir l'ancienne version : « rien n'a changé ».
// Ce script s'exécute tout seul avant `npm run build` (script npm « prebuild »).
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const OBSOLETES = [
  'src/hooks.server.ts',                     // rendu serveur : supprimé (site statique)
  'src/routes/+layout.server.ts',            // idem
  'src/routes/auth/callback/+server.ts',     // remplacé par une page du navigateur
  'src/routes/auth/confirm/+server.ts'       // idem
];

export function nettoyer(racine, journal = console.log) {
  const supprimes = [];
  for (const chemin of OBSOLETES) {
    const complet = join(racine, chemin);
    if (existsSync(complet)) { rmSync(complet, { force: true }); supprimes.push(chemin); journal(`Fichier obsolète supprimé : ${chemin}`); }
  }
  return supprimes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = join(fileURLToPath(import.meta.url), '..', '..');
  const n = nettoyer(racine).length;
  console.log(n ? `${n} fichier(s) obsolète(s) retiré(s).` : 'Aucun fichier obsolète.');
}
