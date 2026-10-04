<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { fmt } from '$lib/format';
  let { data } = $props();
  const canEdit = $derived(['admin', 'manager'].includes(data.profil.role));
  const devise = $derived(data.profil.tenants.devise);

  type F = {
    id?: string; code: string; nom: string; type: string; prix: number | null | undefined;
    pct_commission: number | null | undefined; stock_ref: number | null | undefined;
    status: string; description: string;
  };
  let f = $state<F | null>(null);
  let q = $state('');
  let busy = $state(false), err = $state('');

  const nouveau = () => {
    err = '';
    f = { code: '', nom: '', type: 'ticket', prix: null, pct_commission: 10, stock_ref: 0, status: 'actif', description: '' };
  };
  const editer = (a: any) => {
    err = '';
    f = { id: a.id, code: a.code ?? '', nom: a.nom, type: a.type, prix: Number(a.prix),
      pct_commission: Number(a.pct_commission), stock_ref: a.stock_ref, status: a.status, description: a.description ?? '' };
  };

  const filtres = $derived(
    data.articles.filter((a) => `${a.nom} ${a.code ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  );

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (!f) return;
    busy = true; err = '';
    const { id, ...c } = f;
    const champs = {
      code: c.code.trim() || null, nom: c.nom.trim(), type: c.type,
      prix: Number(c.prix) || 0, pct_commission: Number(c.pct_commission) || 0,
      stock_ref: Math.max(0, Math.floor(Number(c.stock_ref) || 0)),
      status: c.status, description: c.description.trim() || null
    };
    const { error } = id
      ? await data.supabase.from('articles').update(champs).eq('id', id)
      : await data.supabase.from('articles').insert({ ...champs, tenant_id: data.profil.tenant_id });
    busy = false;
    if (error) { err = error.code === '23505' ? 'Ce code article existe déjà.' : error.message; return; }
    f = null;
    await invalidateAll();
  }
</script>

<h1>Articles</h1>
<p class="mut no-print"><a href="/import?type=articles" style="text-decoration:underline">📥 Importer un fichier CSV</a></p>

{#if f}
  <form class="card" onsubmit={enregistrer}>
    <div class="grid2">
      <label>Code<input bind:value={f.code} /></label>
      <label>Type
        <select bind:value={f.type}>
          <option value="ticket">Ticket</option><option value="produit">Produit</option>
          <option value="service">Service</option><option value="autre">Autre</option>
        </select>
      </label>
    </div>
    <label>Nom<input bind:value={f.nom} required /></label>
    <div class="grid2">
      <label>Prix unitaire<input type="number" inputmode="decimal" min="0" step="any" bind:value={f.prix} required /></label>
      <label>Commission %<input type="number" inputmode="decimal" min="0" max="100" step="any" bind:value={f.pct_commission} /></label>
    </div>
    <div class="grid2">
      <label>Stock de référence<input type="number" inputmode="numeric" min="0" bind:value={f.stock_ref} /></label>
      <label>Statut
        <select bind:value={f.status}>
          <option value="actif">Actif</option><option value="inactif">Inactif</option><option value="archive">Archivé</option>
        </select>
      </label>
    </div>
    <label>Description<input bind:value={f.description} /></label>
    {#if err}<p class="err">{err}</p>{/if}
    <button class="btn primary" disabled={busy}>Enregistrer</button>
    <button type="button" class="btn" style="margin-top:.5rem" onclick={() => (f = null)}>Annuler</button>
  </form>
{:else}
  {#if canEdit}<button class="btn primary fab" onclick={nouveau}>+ Nouvel article</button>{/if}
  <input placeholder="Rechercher…" bind:value={q} style="margin-bottom:.8rem" />
{/if}

{#each filtres as a (a.id)}
  <div class="card" style={a.status !== 'actif' ? 'opacity:.55' : ''}>
    <div class="row">
      <strong>{a.nom}</strong><span class="badge">{a.type}</span>
    </div>
    <div class="mut">{a.code ?? '—'} · {fmt(Number(a.prix), devise)} · commission {Number(a.pct_commission)} %</div>
    {#if canEdit}<div class="actions"><button class="btn small" onclick={() => editer(a)}>Modifier</button></div>{/if}
  </div>
{:else}
  <p class="mut">Aucun article.</p>
{/each}
