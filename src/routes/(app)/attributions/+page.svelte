<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { fmt } from '$lib/format';
  let { data } = $props();
  const role = $derived(data.profil.role);
  const canEdit = $derived(['admin', 'manager'].includes(role));
  const devise = $derived(data.profil.tenants.devise);

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
    data.toutes.find(
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
  <select value={data.filtre} onchange={(e) => goto(e.currentTarget.value ? `?commercial=${e.currentTarget.value}` : '?')}
    style="margin-bottom:1rem">
    <option value="">Tous les commerciaux</option>
    {#each data.commerciaux as c}<option value={c.id}>{c.nom}</option>{/each}
  </select>
  {#if err}<p class="err">{err}</p>{/if}
{/if}

{#each data.attributions as a (a.id)}
  {@const vendus = a.qty_initial - a.qty_rest}
  <div class="card">
    <div class="row">
      <div><strong>{a.nom}</strong><div class="mut">{a.commerciaux?.nom} · {fmt(Number(a.prix), devise)} · {Number(a.pct)} %</div></div>
      <span class="badge">{a.qty_rest} restants</span>
    </div>
    <div class="bar"><i style={`width:${a.qty_initial ? Math.round((vendus / a.qty_initial) * 100) : 0}%`}></i></div>
    <div class="mut">{a.qty_initial} attribués → {vendus} écoulés · valeur {fmt(vendus * Number(a.prix), devise)}</div>
    {#if canEdit}
      <div class="actions">
        <button class="btn small" onclick={() => ajuster(a, 10)}>+10</button>
        <button class="btn small" onclick={() => ajuster(a, -10)}>−10</button>
        {#if role === 'admin'}<button class="btn small" onclick={() => supprimer(a)}>Supprimer</button>{/if}
      </div>
    {/if}
  </div>
{:else}
  <p class="mut">Aucune attribution.</p>
{/each}
