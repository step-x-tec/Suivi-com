<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto, preloadData } from '$app/navigation';
  import { etat, demarrer, ecouterNotifications, rafraichir, synchroniser } from '$lib/etat.svelte';
  import { viderActions } from '$lib/file-attente';
  let { data, children } = $props();

  const commercial = $derived(data.profil.role === 'commercial');
  const onglets = $derived(
    commercial
      ? [
          { href: '/portail', icone: '⬡', nom: 'Mon espace' },
          { href: `/credit/${data.profil.commercial_id}/releve`, icone: '◈', nom: 'Relevé' }
        ]
      : [
          { href: '/', icone: '⬡', nom: 'Accueil' },
          { href: '/cloture', icone: '◉', nom: 'Clôture' },
          { href: '/credit', icone: '◈', nom: 'Crédit' },
          { href: '/rapports', icone: '◰', nom: 'Rapports' },
          { href: '/plus', icone: '☰', nom: 'Plus' }
        ]
  );
  const actif = (href: string) =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

  onMount(() => {
    const arreter = demarrer(data.supabase, data.userId);
    const arreterNotifs = ecouterNotifications(data.supabase, data.userId);
    const minuteur = setTimeout(prechauffer, 4000);
    return () => { arreter(); arreterNotifs(); clearTimeout(minuteur); };
  });

  // Charge en arrière-plan les écrans principaux pour qu'ils restent consultables sans réseau
  async function prechauffer() {
    if (!navigator.onLine) return;
    const ecrans = commercial ? ['/portail'] : ['/', '/cloture', '/credit', '/commerciaux', '/attributions', '/articles'];
    for (const h of ecrans) { try { await preloadData(h); } catch { /* écran indisponible */ } }
  }

  async function deconnexion() {
    if (!navigator.onLine) { alert('Connectez-vous à internet pour vous déconnecter.'); return; }
    await synchroniser(data.supabase, data.userId);
    await rafraichir();
    const restantes = etat.enAttente + etat.refuses;
    if (restantes > 0 && !confirm(`${restantes} action(s) enregistrée(s) hors ligne ne sont pas envoyées et seront supprimées. Se déconnecter quand même ?`)) return;
    await viderActions();
    navigator.serviceWorker?.controller?.postMessage('vider'); // efface pages et données en cache
    try { localStorage.removeItem('commpro:profil'); } catch { /* ignoré */ }
    await data.supabase.auth.signOut({ scope: 'global' });
    await goto('/login', { invalidateAll: true });
  }
</script>

<nav class="tabbar" style={`--n:${onglets.length}`}>
  {#each onglets as o}
    <a href={o.href} class:on={actif(o.href)}><i>{o.icone}</i>{o.nom}</a>
  {/each}
</nav>

<main class="page">
  <div class="row no-print" style="margin-bottom:.5rem">
    <span class="mut">{data.profil.tenants.name}</span>
    <div style="display:flex;gap:.5rem;align-items:center">
      <a class="btn small" href="/notifications" aria-label="Notifications">🔔{#if etat.nonLues > 0}<span class="badge" style="margin-left:.3rem;background:var(--acc);color:var(--acc-txt)">{etat.nonLues}</span>{/if}</a>
      <button class="btn small" onclick={deconnexion}>Déconnexion</button>
    </div>
  </div>
  {#if etat.toast}
    <a class="card no-print" href="/notifications"
       style="position:fixed;left:1rem;right:1rem;top:calc(.6rem + env(safe-area-inset-top, 0px));z-index:30;max-width:520px;margin:0 auto;border-color:var(--acc)">🔔 {etat.toast}</a>
  {/if}
  {#if !etat.enLigne}
    <div class="card no-print">📡 Hors ligne : vous voyez les données de votre dernière connexion.{etat.enAttente ? ` ${etat.enAttente} action(s) seront envoyées au retour du réseau.` : ''}</div>
  {:else if etat.enAttente > 0}
    <div class="card row no-print">
      <span>⟳ {etat.enAttente} action(s) en cours d'envoi…</span>
      <button class="btn small" disabled={etat.synchro} onclick={() => synchroniser(data.supabase, data.userId)}>Réessayer</button>
    </div>
  {/if}
  {#if etat.refuses > 0}
    <a class="card err no-print" href="/synchronisation">{etat.refuses} action(s) refusée(s) par le serveur : voir le détail →</a>
  {/if}
  {#if !commercial && data.quota?.expire}
    <a class="card err no-print" href="/parametres">Abonnement expiré : les limites du plan Gratuit s'appliquent. Renouveler →</a>
  {:else if !commercial && data.quota && data.quota.plan !== 'free' && data.quota.jours_restants !== null && data.quota.jours_restants <= 7}
    <a class="card no-print" href="/parametres">Votre abonnement expire dans {Math.max(0, data.quota.jours_restants)} jour(s). Renouveler →</a>
  {/if}
  {@render children()}
</main>
