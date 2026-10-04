<script lang="ts">
  import { fmt, dateCourte } from '$lib/format';
  let { data } = $props();
  const c = $derived(data.c);
  const devise = $derived(c.devise as string);

  const texteWhatsApp = $derived(
    `Reçu ${c.reference}\n${data.profil.tenants.name}\nCommercial : ${c.commerciaux.nom}\n` +
    `Date : ${dateCourte(c.created_at)}\nBrut : ${fmt(Number(c.brut), devise)}\n` +
    `Commissions : ${fmt(Number(c.commissions), devise)}\nDivers : ${fmt(Number(c.divers), devise)}\n` +
    `NET À PAYER : ${fmt(Number(c.net_final), devise)}`
  );
</script>

<div class="no-print row" style="margin-bottom:1rem">
  <a href="/cloture" class="mut">‹ Clôtures</a>
  {#if c.status === 'annulee'}<span class="badge err">Annulée</span>{/if}
</div>

<h1>Reçu {c.reference}</h1>
<p class="mut">
  {data.profil.tenants.name} · {dateCourte(c.created_at)}<br />
  Commercial : <strong>{c.commerciaux.nom}</strong>{c.commerciaux.code ? ` (${c.commerciaux.code})` : ''}
</p>

<div class="card scroll-x">
  <table>
    <thead><tr><th>Article</th><th>Vendus</th><th>Déf.</th><th>Rest.</th><th>Brut</th><th>Comm.</th><th>Dû</th></tr></thead>
    <tbody>
      {#each c.cloture_lines as l (l.id)}
        <tr>
          <td>{l.article_nom}</td><td>{l.vend_valides}</td><td>{l.defauts}</td><td>{l.rest_apres}</td>
          <td>{fmt(Number(l.montant), devise)}</td><td>{fmt(Number(l.commission), devise)}</td>
          <td>{fmt(Number(l.du), devise)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if c.cloture_divers.length}
  <div class="card">
    <strong>Déductions diverses</strong>
    {#each c.cloture_divers as d (d.id)}
      <div class="row"><span>{d.label}</span><span>− {fmt(Number(d.montant), devise)}</span></div>
    {/each}
  </div>
{/if}

<div class="card">
  <div class="row"><span>Net à payer</span><span class="net">{fmt(Number(c.net_final), devise)}</span></div>
</div>

<div class="no-print">
  <button class="btn primary" onclick={() => window.print()}>⎙ Imprimer / PDF</button>
  <a class="btn" style="display:block;text-align:center;margin-top:.5rem;line-height:1.9"
     href={`https://wa.me/?text=${encodeURIComponent(texteWhatsApp)}`} target="_blank" rel="noopener">
    Partager sur WhatsApp
  </a>
</div>
