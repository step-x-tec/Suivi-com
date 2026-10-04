<script lang="ts">
  import { fmt, dateCourte } from '$lib/format';
  import { mouvements, totaux } from '$lib/credit';
  let { data } = $props();
  const devise = $derived(data.profil.tenants.devise);
  const liste = $derived(mouvements(data.clotures, data.reglements));
  const t = $derived(totaux(liste));
</script>

<div class="no-print row" style="margin-bottom:1rem">
  <a href={`/credit/${data.c.id}`} class="mut">‹ Retour</a>
</div>

<h1>Relevé de compte</h1>
<p class="mut">
  {data.profil.tenants.name} · édité le {dateCourte(new Date().toISOString())}<br />
  Commercial : <strong>{data.c.nom}</strong>{data.c.code ? ` (${data.c.code})` : ''}
</p>

<div class="card scroll-x">
  <table>
    <thead><tr><th>Date</th><th>Libellé</th><th>Débit</th><th>Crédit</th><th>Solde</th></tr></thead>
    <tbody>
      {#each liste as x (x.kind + x.id)}
        <tr>
          <td>{dateCourte(x.date)}</td>
          <td style="text-align:left">{x.libelle}</td>
          <td>{x.debit ? fmt(x.debit, devise) : ''}</td>
          <td>{x.credit ? fmt(x.credit, devise) : ''}</td>
          <td>{fmt(x.solde ?? 0, devise)}</td>
        </tr>
      {/each}
      <tr>
        <td colspan="2"><strong>Totaux</strong></td>
        <td><strong>{fmt(t.debit, devise)}</strong></td>
        <td><strong>{fmt(t.credit, devise)}</strong></td>
        <td></td>
      </tr>
    </tbody>
  </table>
</div>

<div class="card">
  <div class="row">
    <span>{t.solde > 0 ? 'Reste dû par le commercial' : t.solde < 0 ? 'Dû au commercial' : 'Compte soldé'}</span>
    <span class="net">{fmt(Math.abs(t.solde), devise)}</span>
  </div>
</div>

<button class="btn primary no-print" onclick={() => window.print()}
  disabled={!!data.quota && !data.quota.limites.export_pdf}>⎙ Imprimer / PDF</button>
{#if data.quota && !data.quota.limites.export_pdf}
  <p class="mut no-print">L'export PDF est disponible à partir du plan Starter.</p>
{/if}
