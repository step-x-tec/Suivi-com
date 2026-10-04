<script lang="ts">
  import { fmt } from '$lib/format';
  let { data } = $props();
  const devise = $derived(data.profil.tenants.devise);

  let filtre = $state<'tous' | 'debiteur' | 'crediteur' | 'solde'>('tous');
  const somme = (st: string, signe: number) =>
    data.lignes.filter((l) => l.statut === st).reduce((t, l) => t + signe * Number(l.solde), 0);
  const nb = (st: string) => data.lignes.filter((l) => l.statut === st).length;
  const liste = $derived(data.lignes.filter((l) => filtre === 'tous' || l.statut === filtre));
  const pct = (l: any) =>
    Number(l.total_clotures) > 0
      ? Math.min(100, Math.round(((Number(l.total_remises) + Number(l.total_avances)) / Number(l.total_clotures)) * 100))
      : 0;
</script>

<h1>Crédit</h1>

<div class="grid2">
  <div class="card"><div class="mut">Total dû</div><div class="net deb">{fmt(somme('debiteur', 1), devise)}</div></div>
  <div class="card"><div class="mut">À payer</div><div class="net cred">{fmt(somme('crediteur', -1), devise)}</div></div>
  <div class="card"><div class="mut">Encaissé</div><strong>{fmt(data.encaisse, devise)}</strong></div>
  <div class="card"><div class="mut">Soldés</div><strong>{nb('solde')}</strong></div>
</div>

<div class="seg" style="grid-template-columns:repeat(4,1fr);margin-top:.5rem">
  {#each [['tous', 'Tous'], ['debiteur', 'Débiteurs'], ['crediteur', 'Créditeurs'], ['solde', 'Soldés']] as [k, l]}
    <button class:on={filtre === k} style="font-size:.78rem;padding:.5rem .2rem" onclick={() => (filtre = k as typeof filtre)}>{l}</button>
  {/each}
</div>

{#each liste as l (l.commercial_id)}
  <a class="card" href={`/credit/${l.commercial_id}`}>
    <div class="row">
      <strong>{l.commercial.nom}</strong>
      <strong class={l.statut === 'debiteur' ? 'deb' : l.statut === 'crediteur' ? 'cred' : 'mut'}>
        {l.statut === 'solde' ? 'Soldé' : fmt(Math.abs(Number(l.solde)), devise)}
      </strong>
    </div>
    <div class="bar"><i style={`width:${pct(l)}%`}></i></div>
    <div class="mut">{pct(l)} % réglé · clôtures {fmt(Number(l.total_clotures), devise)}</div>
  </a>
{:else}
  <p class="mut">Aucun commercial dans cette catégorie.</p>
{/each}
