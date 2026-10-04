<script lang="ts">
  import { fmt } from '$lib/format';
  let { data } = $props();
  const devise = $derived(data.profil.tenants.devise);
</script>

<h1>Bonjour {data.profil.nom ?? ''}</h1>

<div class="grid2">
  <div class="card"><div class="mut">Total dû</div><div class="net">{fmt(data.totalDu, devise)}</div></div>
  <div class="card"><div class="mut">À payer</div><div class="net">{fmt(data.totalAPayer, devise)}</div></div>
  <div class="card"><div class="mut">Commerciaux actifs</div><strong>{data.nbCommerciaux}</strong></div>
  <div class="card"><div class="mut">Débiteurs</div><strong>{data.debiteurs}</strong></div>
</div>

{#if data.profil.role !== 'commercial'}
  <a class="btn primary" href="/cloture" style="display:block;text-align:center;line-height:1.9">◉ Nouvelle clôture</a>
{/if}
