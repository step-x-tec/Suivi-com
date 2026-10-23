<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { version } from '$app/environment';

  const CLE = 'commpro:reparation';

  // Réparation : désinscrit le service worker et efface les copies gardées par le navigateur, puis recharge.
  async function reinitialiser() {
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* sans service worker */ }
    try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* sans cache */ }
    location.reload();
  }

  // Une erreur inattendue au lancement vient très souvent d'une copie périmée gardée par le navigateur : on répare UNE fois,
  // automatiquement (le drapeau empêche toute boucle ; si l'erreur revient, la cause exacte reste affichée ci-dessous).
  onMount(() => {
    if (page.status < 500) return;
    try {
      if (sessionStorage.getItem(CLE)) return;
      sessionStorage.setItem(CLE, '1');
    } catch { return; }
    reinitialiser();
  });
</script>

<div class="page" style="padding-bottom:2rem">
  <h1>{page.status === 404 ? 'Page introuvable' : 'Un problème est survenu'}</h1>
  <p class="mut">{page.error?.message ?? ''}</p>
  <a class="btn primary" href="/" style="display:block;text-align:center;line-height:1.9;margin-bottom:.5rem">Retour à l'accueil</a>
  <button class="btn" onclick={reinitialiser}>Réinitialiser l'application</button>
  <a class="btn" href="/diagnostic.html" style="display:block;text-align:center;line-height:1.9;margin-top:.5rem">Diagnostic</a>
  <p class="mut" style="margin-top:.8rem">« Réinitialiser » efface les copies de l'application gardées sur cet appareil (vos données restent sur le serveur).</p>
  <p class="mut">Version de l'application : {version}</p>
</div>
