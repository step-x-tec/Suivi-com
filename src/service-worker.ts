/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

// Hors ligne : l'application s'ouvre sans réseau et affiche les dernières données consultées.
// - fichiers de l'application + page d'accueil (la « coquille » HTML, la même pour toutes les adresses) : gardés à l'installation
// - données (REST Supabase) : réseau d'abord, dernière version en cache si le réseau échoue
// Règle essentielle : la coquille servie hors ligne doit être de la MÊME version que les fichiers (cache `statique-<version>`).
// (Avant : `caches.match('/')` cherchait dans TOUS les caches et pouvait renvoyer une vieille page d'une version précédente,
// d'où une erreur « Internal Error » à chaque lancement sur réseau lent, impossible à corriger par « Réessayer ».)
const sw = self as unknown as ServiceWorkerGlobalScope;
const STATIQUE = `statique-${version}`;
const DONNEES = 'donnees-v2';
const ACTIFS = new Set<string>([...build, ...files]);
const DELAI_RESEAU = 8000; // réseau très lent : on bascule sur le cache plutôt que d'attendre

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIQUE)
      .then(async (c) => { await c.addAll([...build, ...files]); try { await c.add('/'); } catch { /* page d'accueil indisponible : sans conséquence */ } })
      .then(() => sw.skipWaiting())
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // on supprime TOUS les caches des versions précédentes (y compris les anciens « pages-v1 » et « donnees-v1 »)
    for (const k of await caches.keys()) if (k !== STATIQUE && k !== DONNEES) await caches.delete(k);
    await sw.clients.claim();
  })());
});

// À la déconnexion, l'application demande d'effacer les données mises en cache (téléphone partagé)
sw.addEventListener('message', (event) => {
  if (event.data === 'vider') event.waitUntil(caches.delete(DONNEES));
});

async function donneesReseauPuisCache(req: Request): Promise<Response> {
  const cache = await caches.open(DONNEES);
  const reseau = fetch(req).then((rep) => {
    // on ne garde ni les redirections ni les réponses partielles
    if (rep.ok && !rep.redirected && rep.status === 200) cache.put(req, rep.clone());
    return rep;
  });
  try {
    return await Promise.race([
      reseau,
      new Promise<Response>((_, rejeter) => setTimeout(() => rejeter(new Error('delai')), DELAI_RESEAU))
    ]);
  } catch {
    const enCache = await cache.match(req, { ignoreVary: true });
    if (enCache) { reseau.catch(() => {}); return enCache; }
    return reseau; // rien en cache : on laisse l'erreur réseau remonter à l'application
  }
}

// Navigation : le réseau d'abord ; hors ligne ou trop lent, la coquille de CETTE version, quelle que soit l'adresse demandée.
async function navigation(req: Request): Promise<Response> {
  try {
    return await Promise.race([
      fetch(req),
      new Promise<Response>((_, rejeter) => setTimeout(() => rejeter(new Error('delai')), DELAI_RESEAU))
    ]);
  } catch {
    const coquille = await (await caches.open(STATIQUE)).match('/');
    return coquille ?? Response.error();
  }
}

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === sw.location.origin) {
    if (ACTIFS.has(url.pathname)) {
      event.respondWith(caches.open(STATIQUE).then((c) => c.match(req)).then((r) => r ?? fetch(req)));
      return;
    }
    if (req.mode === 'navigate') event.respondWith(navigation(req));
    return; // tout le reste du même site (ex. version.json) : réponse du réseau, jamais gardée
  }
  if (url.pathname.startsWith('/rest/v1/')) event.respondWith(donneesReseauPuisCache(req));
});
