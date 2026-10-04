/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

// Hors ligne : l'application s'ouvre sans réseau et affiche les dernières données consultées.
// - fichiers de l'application : pré-mis en cache, servis depuis le cache
// - pages et données (REST Supabase) : réseau d'abord, dernière version en cache si le réseau échoue
const sw = self as unknown as ServiceWorkerGlobalScope;
const STATIQUE = `statique-${version}`;
const PAGES = 'pages-v1';
const DONNEES = 'donnees-v1';
const ACTIFS = new Set<string>([...build, ...files]);
const DELAI_RESEAU = 8000; // réseau très lent : on bascule sur le cache plutôt que d'attendre

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIQUE).then((c) => c.addAll([...build, ...files])).then(() => sw.skipWaiting())
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('statique-') && k !== STATIQUE) await caches.delete(k);
    await sw.clients.claim();
  })());
});

// À la déconnexion, l'application demande d'effacer les données mises en cache (téléphone partagé)
sw.addEventListener('message', (event) => {
  if (event.data === 'vider') event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(DONNEES)]));
});

async function reseauPuisCache(req: Request, nom: string): Promise<Response> {
  const cache = await caches.open(nom);
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

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === sw.location.origin) {
    if (ACTIFS.has(url.pathname)) {
      event.respondWith(caches.match(req).then((r) => r ?? fetch(req)));
      return;
    }
    if (url.pathname.startsWith('/auth/')) return; // liens d'email : jamais de cache
    event.respondWith(reseauPuisCache(req, PAGES));
    return;
  }
  if (url.pathname.startsWith('/rest/v1/')) event.respondWith(reseauPuisCache(req, DONNEES));
});
