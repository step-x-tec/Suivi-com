<script lang="ts">
  let { data } = $props();
  const liens = [
    { href: '/commerciaux', nom: 'Commerciaux', icone: '👤' },
    { href: '/attributions', nom: 'Attributions', icone: '📦' },
    { href: '/articles', nom: 'Articles', icone: '🏷️' },
    { href: '/groupes', nom: 'Groupes', icone: '🗂️' },
    { href: '/import', nom: 'Importer des données (CSV)', icone: '📥' },
    { href: '/historique', nom: 'Historique des clôtures', icone: '📜' },
    { href: '/journal', nom: "Journal d'activité", icone: '🕑' },
    { href: '/parametres', nom: 'Paramètres', icone: '⚙️' }
  ];
  let theme = $state((typeof localStorage !== 'undefined' && localStorage.getItem('theme')) || 'auto');

  function appliquer(t: string) {
    theme = t;
    try { localStorage.setItem('theme', t); } catch { /* stockage indisponible */ }
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = t;
  }
</script>

<h1>Plus</h1>
{#each liens as l}
  <a class="card row" href={l.href}><span>{l.icone} {l.nom}</span><span class="mut">›</span></a>
{/each}

<h2>Thème</h2>
<div class="seg" style="grid-template-columns:repeat(3,1fr)">
  {#each ['auto', 'dark', 'light'] as t}
    <button class:on={theme === t} onclick={() => appliquer(t)}>{t === 'auto' ? 'Auto' : t === 'dark' ? 'Sombre' : 'Clair'}</button>
  {/each}
</div>
