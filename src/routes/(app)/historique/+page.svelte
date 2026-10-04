<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { fmt, dateCourte } from '$lib/format';
  import { toCsv, telecharger } from '$lib/csv';
  let { data } = $props();
  const devise = $derived(data.profil.tenants.devise);
  const isAdmin = $derived(data.profil.role === 'admin');

  let commercial = $state(''), statut = $state('validee'), du = $state(''), au = $state('');
  let tri = $state<'date' | 'montant'>('date');
  let err = $state('');

  const liste = $derived(
    data.clotures
      .filter((k) =>
        (!commercial || k.commercial_id === commercial) &&
        (!statut || k.status === statut) &&
        (!du || k.created_at.slice(0, 10) >= du) &&
        (!au || k.created_at.slice(0, 10) <= au))
      .sort((a, b) => (tri === 'date'
        ? b.created_at.localeCompare(a.created_at)
        : Number(b.net_final) - Number(a.net_final)))
  );
  const totalNet = $derived(liste.reduce((t, k) => t + Number(k.net_final), 0));

  async function annuler(k: any) {
    const motif = prompt(`Annuler ${k.reference} ?\nLe stock du commercial sera restitué.\n\nMotif :`);
    if (!motif?.trim()) return;
    err = '';
    const { error } = await data.supabase.rpc('annuler_cloture', { p_cloture_id: k.id, p_motif: motif.trim() });
    if (error) err = error.message;
    await invalidateAll();
  }

  function exporter() {
    telecharger('historique-clotures.csv', toCsv([
      ['Référence', 'Date', 'Commercial', 'Brut', 'Commissions', 'Divers', 'Net', 'Statut'],
      ...liste.map((k) => [k.reference, k.created_at.slice(0, 10), k.commerciaux?.nom, Number(k.brut),
        Number(k.commissions), Number(k.divers), Number(k.net_final), k.status])
    ]));
  }
</script>

<h1>Historique</h1>

<div class="grid2">
  <select bind:value={commercial}>
    <option value="">Tous les commerciaux</option>
    {#each data.commerciaux as c}<option value={c.id}>{c.nom}</option>{/each}
  </select>
  <select bind:value={statut}>
    <option value="validee">Validées</option><option value="annulee">Annulées</option><option value="">Toutes</option>
  </select>
  <label style="margin:.6rem 0 0">Du<input type="date" bind:value={du} /></label>
  <label style="margin:.6rem 0 0">Au<input type="date" bind:value={au} /></label>
</div>
<div class="seg" style="margin-top:.6rem">
  <button class:on={tri === 'date'} onclick={() => (tri = 'date')}>Par date</button>
  <button class:on={tri === 'montant'} onclick={() => (tri = 'montant')}>Par montant</button>
</div>

<div class="row" style="margin-bottom:.8rem">
  <span class="mut">{liste.length} clôture(s) · net {fmt(totalNet, devise)}</span>
  <button class="btn small" onclick={exporter} disabled={liste.length === 0}>Export CSV</button>
</div>
{#if err}<p class="err">{err}</p>{/if}

{#each liste as k (k.id)}
  <div class="card" style={k.status === 'annulee' ? 'opacity:.6' : ''}>
    <a class="row" href={`/recu/${k.id}`}>
      <div>
        <strong>{k.reference}</strong>
        <div class="mut">{k.commerciaux?.nom} · {dateCourte(k.created_at)}{k.status === 'annulee' ? ' · annulée' : ''}</div>
      </div>
      <strong>{fmt(Number(k.net_final), devise)}</strong>
    </a>
    {#if k.annulee_motif}<div class="mut">Motif : {k.annulee_motif}</div>{/if}
    {#if isAdmin && k.status === 'validee'}
      <div class="actions"><button class="btn small" onclick={() => annuler(k)}>Annuler la clôture</button></div>
    {/if}
  </div>
{:else}
  <p class="mut">Aucune clôture.</p>
{/each}
