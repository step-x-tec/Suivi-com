<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
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

  async function deconnexion() {
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
    <button class="btn small" onclick={deconnexion}>Déconnexion</button>
  </div>
  {#if !commercial && data.quota?.expire}
    <a class="card err no-print" href="/parametres">Abonnement expiré : les limites du plan Gratuit s'appliquent. Renouveler →</a>
  {:else if !commercial && data.quota && data.quota.plan !== 'free' && data.quota.jours_restants !== null && data.quota.jours_restants <= 7}
    <a class="card no-print" href="/parametres">Votre abonnement expire dans {Math.max(0, data.quota.jours_restants)} jour(s). Renouveler →</a>
  {/if}
  {@render children()}
</main>
