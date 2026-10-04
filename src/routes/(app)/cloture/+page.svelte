<script lang="ts">
  import { pleine } from '$lib/plans';
  let { data } = $props();
  const bloque = $derived(!!data.quota && pleine(data.quota.usage.clotures_mois, data.quota.limites.clotures_mois));
</script>

<h1>Clôture</h1>
{#if bloque}
  <p class="err">Limite du plan atteinte ({data.quota?.limites.clotures_mois} clôtures ce mois). Passez à un plan supérieur pour continuer à clôturer.</p>
{:else if data.quota?.limites.clotures_mois}
  <p class="mut">{data.quota.usage.clotures_mois} / {data.quota.limites.clotures_mois} clôtures ce mois</p>
{/if}
<p class="mut">Choisissez un commercial.</p>

{#each data.commerciaux as c (c.id)}
  <a class="card row" href={`/cloture/${c.id}`}>
    <div>
      <strong>{c.nom}</strong>
      <div class="mut">{[c.code, c.zone].filter(Boolean).join(' · ')}</div>
    </div>
    <span class="badge">{c.attributions?.[0]?.count ?? 0} article(s)</span>
  </a>
{:else}
  <p class="mut">Aucun commercial actif. Ajoutez-en depuis « Plus » (bientôt disponible).</p>
{/each}
