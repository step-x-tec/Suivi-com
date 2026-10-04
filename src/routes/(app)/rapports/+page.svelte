<script lang="ts">
  import { goto } from '$app/navigation';
  import { fmt, dateCourte } from '$lib/format';
  import { toCsv, telecharger } from '$lib/csv';
  import { telechargerXlsx } from '$lib/xlsx';
  import { inventaire, parCommercial, parGroupe, periode, tauxEcoulement, totauxClotures, type CodePeriode } from '$lib/rapports';
  let { data } = $props();
  const devise = $derived(data.profil.tenants.devise);

  type Col = { l: string; t: 'txt' | 'money' | 'pct' | 'int' };
  const ONGLETS = [['resume', 'Résumé'], ['ventes', 'Ventes'], ['commissions', 'Commissions'],
    ['attributions', 'Attributions'], ['inventaire', 'Inventaire']] as const;
  const RACCOURCIS: [CodePeriode, string][] = [['jour', "Aujourd'hui"], ['semaine', 'Semaine'], ['mois', 'Mois'],
    ['trimestre', 'Trimestre'], ['annee', 'Année']];

  let onglet = $state<(typeof ONGLETS)[number][0]>('resume');
  let du = $state(data.du), au = $state(data.au);
  $effect(() => { du = data.du; au = data.au; });

  const appliquer = (a: string, b: string) => goto(`?du=${a}&au=${b}`, { keepFocus: true });
  const raccourci = (c: CodePeriode) => { const p = periode(c); appliquer(p.du, p.au); };

  const tot = $derived(totauxClotures(data.clotures));
  const comm = $derived(parCommercial(data.clotures, data.attributions));

  function construire(o: (typeof ONGLETS)[number][0]): { cols: Col[]; rows: (string | number)[][] } {
    switch (o) {
      case 'resume':
        return { cols: [{ l: 'Groupe', t: 'txt' }, { l: 'Clôt.', t: 'int' }, { l: 'Ventes', t: 'money' }, { l: 'Comm.', t: 'money' }, { l: 'Net', t: 'money' }],
          rows: parGroupe(data.clotures, data.groupes).map((g) => [g.groupe, g.nb, g.ventes, g.commissions, g.net]) };
      case 'ventes':
        return { cols: [{ l: 'Commercial', t: 'txt' }, { l: 'Ventes', t: 'money' }, { l: 'Écoul.', t: 'pct' }, { l: 'Comm.', t: 'money' }, { l: 'Net', t: 'money' }],
          rows: comm.map((r) => [r.nom, r.ventes, r.ecoulement, r.commissions, r.net]) };
      case 'commissions':
        return { cols: [{ l: 'Commercial', t: 'txt' }, { l: 'Comm.', t: 'money' }, { l: 'Taux moy.', t: 'pct' }, { l: 'Clôt.', t: 'int' }, { l: 'Dernière', t: 'txt' }],
          rows: comm.map((r) => [r.nom, r.commissions, r.tauxCommission, r.nb, r.derniere ? dateCourte(r.derniere) : '—']) };
      case 'attributions':
        return { cols: [{ l: 'Commercial', t: 'txt' }, { l: 'Article', t: 'txt' }, { l: 'Attrib.', t: 'int' }, { l: 'Rest.', t: 'int' }, { l: 'Valeur vendue', t: 'money' }],
          rows: data.attributions.map((a: any) => [a.commerciaux?.nom ?? '—', a.nom, a.qty_initial, a.qty_rest, (a.qty_initial - a.qty_rest) * Number(a.prix)]) };
      case 'inventaire':
        return { cols: [{ l: 'Article', t: 'txt' }, { l: 'Stock', t: 'int' }, { l: 'Vendus', t: 'int' }, { l: 'Rest.', t: 'int' }, { l: 'Rotation', t: 'pct' }, { l: 'Valeur stock', t: 'money' }],
          rows: inventaire(data.attributions).map((r) => [r.nom, r.stock, r.vendus, r.restants, r.rotation, r.valeur]) };
    }
  }
  const tableau = $derived(construire(onglet));

  const cell = (v: string | number, t: Col['t']) =>
    t === 'money' ? fmt(Number(v), devise) : t === 'pct' ? `${Number(v).toFixed(1)} %` : String(v);

  // Classeur complet : une feuille par onglet, pourcentages arrondis à 1 décimale comme dans le CSV
  function exporterExcel() {
    telechargerXlsx(`rapports-${data.du}_${data.au}.xlsx`, ONGLETS.map(([k, titre]) => {
      const t = construire(k);
      return { nom: titre, lignes: [t.cols.map((c) => c.l), ...t.rows.map((r) => r.map((v, i) => (t.cols[i].t === 'pct' ? Number(Number(v).toFixed(1)) : v)))] };
    }));
  }

  function exporter() {
    telecharger(`rapport-${onglet}-${data.du}_${data.au}.csv`,
      toCsv([tableau.cols.map((c) => c.l), ...tableau.rows.map((r) => r.map((v, i) =>
        tableau.cols[i].t === 'pct' ? Number(Number(v).toFixed(1)) : v))]));
  }
</script>

<h1>Rapports</h1>

<div class="scroll-x no-print" style="margin-bottom:.6rem">
  <div style="display:flex;gap:.4rem">
    {#each RACCOURCIS as [c, l]}<button class="btn small" onclick={() => raccourci(c)}>{l}</button>{/each}
  </div>
</div>
<div class="grid2 no-print">
  <label>Du<input type="date" bind:value={du} onchange={() => du && au && appliquer(du, au)} /></label>
  <label>Au<input type="date" bind:value={au} onchange={() => du && au && appliquer(du, au)} /></label>
</div>

<div class="scroll-x no-print" style="margin:.4rem 0 1rem">
  <div style="display:flex;gap:.4rem">
    {#each ONGLETS as [k, l]}
      <button class="btn small" class:primary={onglet === k} onclick={() => (onglet = k)}>{l}</button>
    {/each}
  </div>
</div>

<p class="mut">Du {dateCourte(data.du)} au {dateCourte(data.au)}</p>

{#if onglet === 'resume'}
  <div class="grid2">
    <div class="card"><div class="mut">Ventes</div><div class="net">{fmt(tot.brut, devise)}</div></div>
    <div class="card"><div class="mut">Net encaissable</div><strong>{fmt(tot.net, devise)}</strong></div>
    <div class="card"><div class="mut">Commissions</div><strong>{fmt(tot.commissions, devise)}</strong></div>
    <div class="card"><div class="mut">Clôtures</div><strong>{tot.nb}</strong></div>
  </div>
  <div class="card"><div class="row"><span class="mut">Taux d'écoulement global</span>
    <strong>{tauxEcoulement(data.attributions).toFixed(1)} %</strong></div></div>
{/if}

<div class="card scroll-x">
  <table>
    <thead><tr>{#each tableau.cols as c}<th>{c.l}</th>{/each}</tr></thead>
    <tbody>
      {#each tableau.rows as r}
        <tr>{#each r as v, i}<td>{cell(v, tableau.cols[i].t)}</td>{/each}</tr>
      {:else}
        <tr><td colspan={tableau.cols.length} class="mut">Aucune donnée sur cette période.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="grid2 no-print">
  <button class="btn" onclick={exporterExcel}>⬇ Excel (tous les onglets)</button>
  <button class="btn" onclick={exporter} disabled={tableau.rows.length === 0}>CSV (onglet affiché)</button>
</div>
<button class="btn no-print" style="margin-top:.5rem" onclick={() => window.print()} disabled={!data.quota?.limites.export_pdf}>⎙ Imprimer / PDF</button>
{#if data.quota && !data.quota.limites.export_pdf}
  <p class="mut no-print">L'export PDF est disponible à partir du plan Starter.</p>
{/if}
