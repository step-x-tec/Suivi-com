<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { fmt } from '$lib/format';
  import { filtrer, paginer, trier, valeurVendue, type CleTri, type Sens } from '$lib/attributions';
  let { data } = $props();
  const role = $derived(data.profil.role);
  const canEdit = $derived(['admin', 'manager'].includes(role));
  const devise = $derived(data.profil.tenants.devise);

  // Affichage : filtres croisés, tri, pagination (25 / 50 / 100), vue condensée
  let fCommercial = $state(data.filtre), fGroupe = $state(''), fArticle = $state(''), q = $state('');
  let tri = $state<CleTri>('date'), sens = $state<Sens>('desc');
  let taille = $state(25), page = $state(0), condense = $state(false);
  const TRIS: [CleTri, string][] = [['date', 'Date'], ['commercial', 'Commercial'], ['article', 'Article'],
    ['commission', 'Commission %'], ['restant', 'Stock restant'], ['valeur', 'Valeur vendue']];

  const articlesDistincts = $derived([...new Set<string>(data.attributions.map((a: { nom: string }) => a.nom.trim()))].sort((x, y) => x.localeCompare(y, 'fr')));
  const filtrees = $derived(filtrer(data.attributions, { commercial: fCommercial, groupe: fGroupe, article: fArticle, q }));
  const triees = $derived(trier(filtrees, tri, sens));
  const vue = $derived(paginer(triees, page, taille));
  // tout changement de filtre, de tri ou de taille ramène à la première page
  $effect(() => { fCommercial; fGroupe; fArticle; q; tri; sens; taille; page = 0; });

  type F = {
    commerciaux: string[]; article_ref: string; nom: string; code: string;
    prix: number | null | undefined; pct: number | null | undefined; qty: number | null | undefined;
  };
  let f = $state<F | null>(null);
  let doublons = $state<string[] | null>(null);
  let busy = $state(false), err = $state('');

  const nouveau = () => {
    err = ''; doublons = null;
    f = { commerciaux: data.filtre ? [data.filtre] : [], article_ref: '', nom: '', code: '', prix: null, pct: 10, qty: null };
  };

  function choisirArticle() {
    if (!f) return;
    const a = data.articles.find((x) => x.id === f!.article_ref);
    if (!a) return;
    f.nom = a.nom; f.code = a.code ?? ''; f.prix = Number(a.prix); f.pct = Number(a.pct_commission);
  }

  const qty = $derived(f && typeof f.qty === 'number' ? Math.floor(f.qty) : 0);
  const existant = (cid: string) =>
    data.attributions.find(
      (x) =>
        x.commercial_id === cid &&
        (f!.article_ref ? x.article_ref === f!.article_ref : x.nom.trim().toLowerCase() === f!.nom.trim().toLowerCase())
    );

  function preparer(e: SubmitEvent) {
    e.preventDefault();
    if (!f) return;
    err = '';
    if (f.commerciaux.length === 0) { err = 'Choisissez au moins un commercial.'; return; }
    if (qty <= 0) { err = 'Quantité invalide.'; return; }
    const noms = f.commerciaux.filter((cid) => existant(cid)).map((cid) => data.commerciaux.find((c) => c.id === cid)?.nom ?? '');
    if (noms.length) doublons = noms;
    else appliquer('nouveau');
  }

  async function appliquer(mode: 'ajouter' | 'nouveau') {
    if (!f) return;
    busy = true; err = '';
    for (const cid of f.commerciaux) {
      const ex = existant(cid);
      const { error } =
        ex && mode === 'ajouter'
          ? await data.supabase.from('attributions')
              .update({ qty_initial: ex.qty_initial + qty, qty_rest: ex.qty_rest + qty, updated_at: new Date().toISOString() })
              .eq('id', ex.id)
          : await data.supabase.from('attributions').insert({
              tenant_id: data.profil.tenant_id, commercial_id: cid, article_ref: f.article_ref || null,
              nom: f.nom.trim(), code: f.code.trim() || null, prix: Number(f.prix) || 0, pct: Number(f.pct) || 0,
              qty_initial: qty, qty_rest: qty
            });
      if (error) { err = error.message; busy = false; return; }
    }
    busy = false; f = null; doublons = null;
    await invalidateAll();
  }

  // Ajout / retrait de stock : modifie le stock initial ET restant (pas une vente)
  async function ajuster(a: any, delta: number) {
    if (delta < 0 && a.qty_rest < -delta) { err = 'Stock restant insuffisant.'; return; }
    err = '';
    const { error } = await data.supabase.from('attributions')
      .update({ qty_initial: a.qty_initial + delta, qty_rest: a.qty_rest + delta, updated_at: new Date().toISOString() })
      .eq('id', a.id);
    if (error) err = error.message;
    await invalidateAll();
  }

  async function supprimer(a: any) {
    if (!confirm(`Supprimer « ${a.nom} » pour ${a.commerciaux?.nom} ?`)) return;
    const { error } = await data.supabase.from('attributions').delete().eq('id', a.id);
    if (error) err = error.message;
    await invalidateAll();
  }
</script>

<h1>Attributions</h1>

{#if f}
  {#if doublons}
    <div class="card">
      <strong>Article déjà attribué</strong>
      <p class="mut">{doublons.join(', ')} possède(nt) déjà cet article. Additionner la quantité au stock existant ?</p>
      <button class="btn primary" disabled={busy} onclick={() => appliquer('ajouter')}>Additionner</button>
      <button class="btn" style="margin-top:.5rem" disabled={busy} onclick={() => appliquer('nouveau')}>Créer une ligne séparée</button>
      <button class="btn" style="margin-top:.5rem" disabled={busy} onclick={() => (doublons = null)}>Retour</button>
    </div>
  {:else}
    <form class="card" onsubmit={preparer}>
      <label>Commerciaux ({f.commerciaux.length})</label>
      <div class="checks">
        {#each data.commerciaux as c (c.id)}
          <label><input type="checkbox" value={c.id} bind:group={f.commerciaux} />{c.nom}</label>
        {/each}
      </div>
      <label>Article du catalogue
        <select bind:value={f.article_ref} onchange={choisirArticle}>
          <option value="">Saisie manuelle</option>
          {#each data.articles as a}<option value={a.id}>{a.nom}</option>{/each}
        </select>
      </label>
      <div class="grid2">
        <label>Nom<input bind:value={f.nom} required /></label>
        <label>Code<input bind:value={f.code} /></label>
      </div>
      <div class="grid2">
        <label>Prix unitaire<input type="number" inputmode="decimal" min="0" step="any" bind:value={f.prix} required /></label>
        <label>Commission %<input type="number" inputmode="decimal" min="0" max="100" step="any" bind:value={f.pct} /></label>
      </div>
      <label>Quantité<input type="number" inputmode="numeric" min="1" bind:value={f.qty} required /></label>
      {#if err}<p class="err">{err}</p>{/if}
      <button class="btn primary" disabled={busy}>Attribuer</button>
      <button type="button" class="btn" style="margin-top:.5rem" onclick={() => (f = null)}>Annuler</button>
    </form>
  {/if}
{:else}
  {#if canEdit}<button class="btn primary fab" onclick={nouveau}>+ Nouvelle attribution</button>{/if}
  <input placeholder="Rechercher (article, commercial)…" bind:value={q} />
  <div class="grid2" style="margin:.6rem 0">
    <select bind:value={fCommercial}>
      <option value="">Tous les commerciaux</option>
      {#each data.commerciaux as c}<option value={c.id}>{c.nom}</option>{/each}
    </select>
    <select bind:value={fGroupe}>
      <option value="">Tous les groupes</option>
      {#each data.groupes as g}<option value={g.id}>{g.nom}</option>{/each}
    </select>
    <select bind:value={fArticle}>
      <option value="">Tous les articles</option>
      {#each articlesDistincts as n}<option value={n}>{n}</option>{/each}
    </select>
    <select bind:value={tri}>{#each TRIS as [k, l]}<option value={k}>Trier : {l}</option>{/each}</select>
  </div>
  <div class="row" style="margin-bottom:.8rem">
    <span class="mut">{vue.total} attribution(s)</span>
    <div style="display:flex;gap:.4rem">
      <button class="btn small" onclick={() => (sens = sens === 'asc' ? 'desc' : 'asc')}>{sens === 'asc' ? '↑ Croissant' : '↓ Décroissant'}</button>
      <button class="btn small" onclick={() => (condense = !condense)}>{condense ? 'Vue détaillée' : 'Vue condensée'}</button>
    </div>
  </div>
  {#if err}<p class="err">{err}</p>{/if}
{/if}

{#each vue.items as a (a.id)}
  {@const vendus = a.qty_initial - a.qty_rest}
  {#if condense}
    <div class="card row" style="padding:.55rem .8rem">
      <div style="min-width:0">
        <strong>{a.nom}</strong> <span class="mut">· {a.commerciaux?.nom}</span>
        <div class="mut">{a.qty_rest} / {a.qty_initial} · {fmt(valeurVendue(a), devise)}</div>
      </div>
      {#if canEdit}
        <div class="actions" style="margin:0;flex:none">
          <button class="btn small" onclick={() => ajuster(a, 10)}>+10</button>
          <button class="btn small" onclick={() => ajuster(a, -10)}>−10</button>
        </div>
      {/if}
    </div>
  {:else}
    <div class="card">
      <div class="row">
        <div><strong>{a.nom}</strong><div class="mut">{a.commerciaux?.nom} · {fmt(Number(a.prix), devise)} · {Number(a.pct)} %</div></div>
        <span class="badge">{a.qty_rest} restants</span>
      </div>
      <div class="bar"><i style={`width:${a.qty_initial ? Math.round((vendus / a.qty_initial) * 100) : 0}%`}></i></div>
      <div class="mut">{a.qty_initial} attribués → {vendus} écoulés · valeur {fmt(valeurVendue(a), devise)}</div>
      {#if canEdit}
        <div class="actions">
          <button class="btn small" onclick={() => ajuster(a, 10)}>+10</button>
          <button class="btn small" onclick={() => ajuster(a, -10)}>−10</button>
          {#if role === 'admin'}<button class="btn small" onclick={() => supprimer(a)}>Supprimer</button>{/if}
        </div>
      {/if}
    </div>
  {/if}
{:else}
  <p class="mut">Aucune attribution ne correspond.</p>
{/each}

{#if vue.total > 0 && !f}
  <div class="row" style="margin-top:.8rem">
    <button class="btn small" disabled={vue.page === 0} onclick={() => (page = vue.page - 1)}>‹ Précédent</button>
    <span class="mut">Page {vue.page + 1} / {vue.pages}</span>
    <button class="btn small" disabled={vue.page >= vue.pages - 1} onclick={() => (page = vue.page + 1)}>Suivant ›</button>
  </div>
  <label style="margin-top:.6rem">Lignes par page
    <select bind:value={taille}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
  </label>
{/if}
