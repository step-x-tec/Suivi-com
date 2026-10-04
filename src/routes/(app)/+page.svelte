<script lang="ts">
  import { goto } from '$app/navigation';
  import { fmt, dateCourte } from '$lib/format';
  import { periode, tauxEcoulement, type CodePeriode } from '$lib/rapports';
  import {
    alertesStock, chaleur, retards, serieJournaliere, tauxRecouvrement,
    ventesParArticle, ventesParCommercial, ventesParGroupe
  } from '$lib/dashboard';
  let { data } = $props();
  const devise = $derived(data.profil.tenants.devise);

  const RACCOURCIS: [CodePeriode, string][] = [['jour', "Aujourd'hui"], ['semaine', 'Semaine'], ['mois', 'Mois'], ['annee', 'Année']];
  const COULEURS = ['#f5a524', '#4aa3ff', '#2ecc71', '#ef5350', '#b388ff', '#8b93a7'];
  const aller = (o: { du?: string; au?: string; groupe?: string; article?: string } = {}) => {
    const p = new URLSearchParams({ du: o.du ?? data.du, au: o.au ?? data.au });
    const g = o.groupe ?? data.groupe, a = o.article ?? data.article;
    if (g) p.set('groupe', g);
    if (a) p.set('article', a);
    goto(`?${p}`, { keepFocus: true });
  };

  // Filtres : groupe (commerciaux du groupe) et article (nom d'article)
  const ids = $derived(new Set(data.commerciaux.filter((c) => !data.groupe || c.groupe_id === data.groupe).map((c) => c.id as string)));
  const noms = $derived(new Map<string, string>(data.commerciaux.map((c) => [c.id as string, c.nom as string] as [string, string])));
  const dans = (id: string) => ids.has(id);
  const articles = $derived([...new Set(data.attributions.map((a) => (a.nom as string).trim()))].sort());

  const lignesGroupe = $derived(data.lignes.filter((l) => dans(l.commercial_id)));
  const lignes = $derived(lignesGroupe.filter((l) => !data.article || l.article_nom.trim() === data.article));
  const attrs = $derived(data.attributions.filter((a) => dans(a.commercial_id) && (!data.article || a.nom.trim() === data.article)));
  const soldes = $derived(data.soldes.filter((s) => dans(s.commercial_id)).map((s) => ({ ...s, nom: noms.get(s.commercial_id) ?? '—' })));
  const clotures = $derived(data.clotures.filter((c) => dans(c.commercial_id)));

  const ventes = $derived(lignes.reduce((t, l) => t + l.montant, 0));
  const commissions = $derived(lignes.reduce((t, l) => t + l.commission, 0));
  const valeurStock = $derived(attrs.reduce((t, a) => t + a.qty_rest * Number(a.prix), 0));
  const encaisse = $derived(
    data.reglements.filter((r) => dans(r.commercial_id) && r.date_reglement >= data.du && r.date_reglement <= data.au)
      .reduce((t, r) => t + Number(r.montant), 0));
  const debiteurs = $derived(soldes.filter((s) => s.statut === 'debiteur').sort((a, b) => Number(b.solde) - Number(a.solde)));
  const totalDu = $derived(debiteurs.reduce((t, s) => t + Number(s.solde), 0));
  const nbSoldes = $derived(soldes.filter((s) => s.statut === 'solde').length);
  const nbActifs = $derived(data.commerciaux.filter((c) => dans(c.id) && c.status === 'actif').length);
  const recouvrement = $derived(tauxRecouvrement(soldes));

  const top = $derived(ventesParCommercial(lignes, noms).slice(0, 10));
  const maxVentes = $derived(Math.max(1, ...top.map((t) => t.ventes)));
  const groupesVentes = $derived(ventesParGroupe(lignes, data.groupes));
  const maxGroupe = $derived(Math.max(1, ...groupesVentes.map((g) => g.ventes)));

  const parts = $derived(ventesParArticle(lignesGroupe, 5));
  const segments = $derived.by(() => {
    let debut = 0;
    return parts.map((p, i) => { const s = { ...p, debut, couleur: COULEURS[i % COULEURS.length] }; debut += p.part; return s; });
  });

  const serie = $derived(serieJournaliere(clotures, 30));
  const maxNet = $derived(Math.max(1, ...serie.map((s) => s.net)));
  const courbe = $derived(serie.map((s, i) => `${(i * 300) / (serie.length - 1)},${90 - (Math.max(0, s.net) / maxNet) * 80}`).join(' '));
  const carte = $derived(chaleur(clotures, 12));
  const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  const stockBas = $derived(alertesStock(attrs).slice(0, 5));
  const dernierReglement = $derived.by(() => {
    const m = new Map<string, string>(); // triés du plus récent au plus ancien
    for (const r of data.reglements) if (!m.has(r.commercial_id)) m.set(r.commercial_id, r.date_reglement);
    return m;
  });
  const premiereCloture = $derived.by(() => {
    const m = new Map<string, string>(); // triées de la plus ancienne à la plus récente
    for (const k of data.premieresClotures) if (!m.has(k.commercial_id)) m.set(k.commercial_id, k.created_at);
    return m;
  });
  const enRetard = $derived(retards(soldes, dernierReglement, premiereCloture));
  const retardDe = $derived(new Map(enRetard.map((r) => [r.id, r])));
</script>

<h1>Bonjour {data.profil.nom ?? ''}</h1>

<div class="scroll-x no-print" style="margin-bottom:.6rem">
  <div style="display:flex;gap:.4rem">
    {#each RACCOURCIS as [c, l]}<button class="btn small" onclick={() => { const p = periode(c); aller({ du: p.du, au: p.au }); }}>{l}</button>{/each}
  </div>
</div>
<div class="grid2 no-print" style="margin-bottom:.4rem">
  <input type="date" value={data.du} onchange={(e) => aller({ du: e.currentTarget.value })} style="margin-top:0" />
  <input type="date" value={data.au} onchange={(e) => aller({ au: e.currentTarget.value })} style="margin-top:0" />
</div>
<div class="grid2 no-print" style="margin-bottom:.6rem">
  <select value={data.groupe} onchange={(e) => aller({ groupe: e.currentTarget.value })}>
    <option value="">Tous les groupes</option>
    {#each data.groupes as g}<option value={g.id}>{g.nom}</option>{/each}
  </select>
  <select value={data.article} onchange={(e) => aller({ article: e.currentTarget.value })}>
    <option value="">Tous les articles</option>
    {#each articles as a}<option value={a}>{a}</option>{/each}
  </select>
</div>
<p class="mut">Du {dateCourte(data.du)} au {dateCourte(data.au)}{data.article ? ` · ${data.article}` : ''}</p>

<div class="grid2">
  <div class="card"><div class="mut">Ventes</div><div class="net">{fmt(ventes, devise)}</div></div>
  <div class="card"><div class="mut">Commissions</div><strong>{fmt(commissions, devise)}</strong></div>
  <div class="card"><div class="mut">Encaissé</div><strong class="cred">{fmt(encaisse, devise)}</strong></div>
  <div class="card"><div class="mut">Total dû</div><strong class="deb">{fmt(totalDu, devise)}</strong></div>
  <div class="card"><div class="mut">Valeur du stock restant</div><strong>{fmt(valeurStock, devise)}</strong></div>
  <div class="card"><div class="mut">Taux d'écoulement</div><strong>{tauxEcoulement(attrs).toFixed(1)} %</strong></div>
</div>
<div class="card row">
  <span class="mut">Commerciaux</span>
  <span>{nbActifs} actifs · <span class="deb">{debiteurs.length} débiteur(s)</span> · {nbSoldes} soldé(s)</span>
</div>
{#if data.article}<p class="mut">Les montants dus et encaissés ne dépendent pas de l'article : ils restent ceux du compte.</p>{/if}

<a class="btn primary" href="/cloture" style="display:block;text-align:center;line-height:1.9;margin:.4rem 0 1rem">◉ Nouvelle clôture</a>

<h2>Recouvrement</h2>
<div class="card" style="text-align:center">
  <svg viewBox="0 0 120 70" style="width:min(240px,70%)" role="img" aria-label={`Taux de recouvrement ${recouvrement.toFixed(0)} %`}>
    <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="var(--line)" stroke-width="10" stroke-linecap="round" />
    <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="var(--acc)" stroke-width="10" stroke-linecap="round"
      pathLength="100" stroke-dasharray={`${recouvrement} 100`} />
    <text x="60" y="58" text-anchor="middle" font-size="18" font-weight="800" fill="var(--txt)">{recouvrement.toFixed(0)} %</text>
  </svg>
  <div class="mut">Sommes encaissées / sommes dues (clôtures)</div>
</div>

<h2>Ventes par commercial</h2>
<div class="card">
  {#each top as t (t.id)}
    <div style="margin-bottom:.6rem">
      <div class="row"><span>{t.nom}</span><strong>{fmt(t.ventes, devise)}</strong></div>
      <div class="bar"><i style={`width:${Math.round((t.ventes / maxVentes) * 100)}%`}></i></div>
    </div>
  {:else}
    <p class="mut">Aucune vente sur cette période.</p>
  {/each}
</div>

<h2>Ventes et commissions par groupe</h2>
<div class="card">
  {#each groupesVentes as g (g.groupe)}
    <div style="margin-bottom:.7rem">
      <div class="row"><strong>{g.groupe}</strong><span class="mut">{fmt(g.ventes, devise)} · comm. {fmt(g.commissions, devise)}</span></div>
      <div class="bar"><i style={`width:${Math.round((g.ventes / maxGroupe) * 100)}%`}></i></div>
      <div class="bar"><i style={`width:${Math.round((g.commissions / maxGroupe) * 100)}%;background:#4aa3ff`}></i></div>
    </div>
  {:else}
    <p class="mut">Aucune vente sur cette période.</p>
  {/each}
  {#if groupesVentes.length}
    <div class="mut"><span class="dot" style="background:var(--acc)"></span>Ventes <span class="dot" style="background:#4aa3ff;margin-left:.8rem"></span>Commissions</div>
  {/if}
</div>

<h2>Répartition des articles</h2>
<div class="card row" style="align-items:flex-start">
  {#if segments.length}
    <svg viewBox="0 0 42 42" style="width:140px;flex:none" role="img" aria-label="Part de chaque article dans les ventes">
      <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--line)" stroke-width="6" />
      {#each segments as s (s.nom)}
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke={s.couleur} stroke-width="6" pathLength="100"
          stroke-dasharray={`${s.part} ${100 - s.part}`} stroke-dashoffset={-s.debut} transform="rotate(-90 21 21)" />
      {/each}
    </svg>
    <div style="flex:1;min-width:0">
      {#each segments as s (s.nom)}
        <div class="row" style="margin-bottom:.3rem">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="dot" style={`background:${s.couleur}`}></span>{s.nom}</span>
          <strong>{s.part.toFixed(0)} %</strong>
        </div>
      {/each}
    </div>
  {:else}
    <p class="mut">Aucune vente sur cette période.</p>
  {/if}
</div>

<h2>Clôtures des 30 derniers jours</h2>
<div class="card">
  <svg viewBox="0 0 300 100" preserveAspectRatio="none" style="width:100%;height:110px" role="img" aria-label="Évolution du net encaissable sur 30 jours">
    <polyline points={courbe} fill="none" stroke="var(--acc)" stroke-width="2" vector-effect="non-scaling-stroke" />
  </svg>
  <div class="row mut"><span>{dateCourte(serie[0].jour)}</span><span>max {fmt(maxNet === 1 ? 0 : maxNet, devise)} / jour</span><span>{dateCourte(serie[serie.length - 1].jour)}</span></div>
</div>

<h2>Activité par jour de la semaine</h2>
<div class="card">
  <svg viewBox="0 0 182 98" style="width:100%" role="img" aria-label="Nombre de clôtures par jour sur 12 semaines">
    {#each JOURS as j, i}<text x="0" y={i * 14 + 10} font-size="9" fill="var(--mut)">{j}</text>{/each}
    {#each carte.colonnes as col, w}
      {#each col as c, j}
        {#if !c.futur}
          <rect x={14 + w * 14} y={j * 14} width="12" height="12" rx="2" fill="var(--acc)"
            fill-opacity={c.n === 0 ? 0.08 : 0.25 + (0.75 * c.n) / Math.max(1, carte.max)}>
            <title>{dateCourte(c.date)} : {c.n} clôture(s)</title>
          </rect>
        {/if}
      {/each}
    {/each}
  </svg>
  <div class="mut">12 dernières semaines · plus c'est foncé, plus il y a de clôtures</div>
</div>

<h2>Débiteurs</h2>
{#each debiteurs.slice(0, 5) as s (s.commercial_id)}
  {@const r = retardDe.get(s.commercial_id)}
  <a class="card row" href={`/credit/${s.commercial_id}`}>
    <div>
      <strong>{s.nom}</strong>
      {#if r}<div class="err" style="margin:0">{r.jamaisPaye ? 'Aucun règlement' : 'Dernier règlement'} depuis {r.jours} j</div>{/if}
    </div>
    <strong class="deb">{fmt(Number(s.solde), devise)}</strong>
  </a>
{:else}
  <p class="mut">Aucun débiteur.</p>
{/each}

<h2>Alertes</h2>
{#if enRetard.length === 0 && stockBas.length === 0}
  <p class="mut">Rien à signaler.</p>
{/if}
{#each enRetard.slice(0, 5) as r (r.id)}
  <a class="card" href={`/credit/${r.id}`}>⏰ <strong>{r.nom}</strong> : {fmt(r.solde, devise)} dû, aucun règlement depuis plus de 30 jours ({r.jours} j)</a>
{/each}
{#each stockBas as a (a.id)}
  <a class="card" href="/attributions">📦 <strong>{a.commerciaux?.nom ?? '—'}</strong> : {a.nom}, il reste {a.qty_rest} sur {a.qty_initial}</a>
{/each}

<h2>Dernières clôtures</h2>
{#each data.dernieres as k (k.id)}
  <a class="card row" href={`/recu/${k.id}`}>
    <div><strong>{k.reference}</strong><div class="mut">{k.commerciaux?.nom} · {dateCourte(k.created_at)}</div></div>
    <strong>{fmt(Number(k.net_final), devise)}</strong>
  </a>
{:else}
  <p class="mut">Aucune clôture.</p>
{/each}
