<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { fmt } from '$lib/format';
  import { pleine } from '$lib/plans';
  let { data } = $props();
  const canEdit = $derived(['admin', 'manager'].includes(data.profil.role));
  const devise = $derived(data.profil.tenants.devise);
  const limiteAtteinte = $derived(!!data.quota && pleine(data.quota.usage.commerciaux, data.quota.limites.commerciaux));

  type F = {
    id?: string; code: string; nom: string; telephone: string; email: string; zone: string; adresse: string;
    groupe_id: string; pct_default: number | null | undefined; status: string; notes: string;
  };
  let f = $state<F | null>(null);
  let q = $state(''), filtreStatut = $state('actif'), filtreGroupe = $state('');
  let busy = $state(false), err = $state('');

  const nouveau = () => {
    err = '';
    f = { code: '', nom: '', telephone: '', email: '', zone: '', adresse: '', groupe_id: '', pct_default: 10, status: 'actif', notes: '' };
  };
  const editer = (c: any) => {
    err = '';
    f = { id: c.id, code: c.code ?? '', nom: c.nom, telephone: c.telephone ?? '', email: c.email ?? '', zone: c.zone ?? '',
      adresse: c.adresse ?? '', groupe_id: c.groupe_id ?? '', pct_default: Number(c.pct_default), status: c.status, notes: c.notes ?? '' };
  };

  const liste = $derived(
    data.commerciaux.filter(
      (c) =>
        (!filtreStatut || c.status === filtreStatut) &&
        (!filtreGroupe || c.groupe_id === filtreGroupe) &&
        `${c.nom} ${c.code ?? ''} ${c.zone ?? ''} ${c.telephone ?? ''}`.toLowerCase().includes(q.toLowerCase())
    )
  );

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (!f) return;
    busy = true; err = '';
    const { id, ...c } = f;
    const n = (v: string) => v.trim() || null;
    const champs = {
      code: n(c.code), nom: c.nom.trim(), telephone: n(c.telephone), email: n(c.email), zone: n(c.zone),
      adresse: n(c.adresse), groupe_id: c.groupe_id || null, pct_default: Number(c.pct_default) || 0,
      status: c.status, notes: n(c.notes)
    };
    const { error } = id
      ? await data.supabase.from('commerciaux').update(champs).eq('id', id)
      : await data.supabase.from('commerciaux').insert({ ...champs, tenant_id: data.profil.tenant_id });
    busy = false;
    if (error) { err = error.code === '23505' ? 'Ce code commercial existe déjà.' : error.message; return; }
    f = null;
    await invalidateAll();
  }
</script>

<h1>Commerciaux</h1>
<p class="mut no-print"><a href="/import?type=commerciaux" style="text-decoration:underline">📥 Importer un fichier CSV</a></p>

{#if f}
  <form class="card" onsubmit={enregistrer}>
    <div class="grid2">
      <label>Code<input bind:value={f.code} /></label>
      <label>Statut
        <select bind:value={f.status}><option value="actif">Actif</option><option value="inactif">Inactif</option></select>
      </label>
    </div>
    <label>Nom complet<input bind:value={f.nom} required /></label>
    <div class="grid2">
      <label>Téléphone<input type="tel" bind:value={f.telephone} /></label>
      <label>Email<input type="email" bind:value={f.email} /></label>
    </div>
    <div class="grid2">
      <label>Zone<input bind:value={f.zone} /></label>
      <label>Groupe
        <select bind:value={f.groupe_id}>
          <option value="">—</option>
          {#each data.groupes as g}<option value={g.id}>{g.nom}</option>{/each}
        </select>
      </label>
    </div>
    <label>Adresse<input bind:value={f.adresse} /></label>
    <label>Commission par défaut (%)<input type="number" inputmode="decimal" min="0" max="100" step="any" bind:value={f.pct_default} /></label>
    <label>Notes internes<input bind:value={f.notes} /></label>
    {#if err}<p class="err">{err}</p>{/if}
    <button class="btn primary" disabled={busy}>Enregistrer</button>
    <button type="button" class="btn" style="margin-top:.5rem" onclick={() => (f = null)}>Annuler</button>
  </form>
{:else}
  {#if canEdit}
    <button class="btn primary fab" onclick={nouveau} disabled={limiteAtteinte} style="margin-bottom:.4rem">+ Nouveau commercial</button>
    {#if limiteAtteinte}<p class="err">Limite du plan atteinte ({data.quota?.limites.commerciaux} commerciaux actifs). Passez à un plan supérieur dans Paramètres.</p>{/if}
  {/if}
  <input placeholder="Rechercher…" bind:value={q} />
  <div class="grid2" style="margin:.6rem 0 1rem">
    <select bind:value={filtreStatut}>
      <option value="actif">Actifs</option><option value="inactif">Inactifs</option><option value="">Tous</option>
    </select>
    <select bind:value={filtreGroupe}>
      <option value="">Tous les groupes</option>
      {#each data.groupes as g}<option value={g.id}>{g.nom}</option>{/each}
    </select>
  </div>
{/if}

{#each liste as c (c.id)}
  {@const s = data.soldes.get(c.id)}
  <div class="card">
    <a href={`/commerciaux/${c.id}`} class="row">
      <div>
        <strong>{c.nom}</strong>
        <div class="mut">{[c.code, c.zone, c.groupes?.nom].filter(Boolean).join(' · ')}</div>
      </div>
      {#if s}
        <strong class={s.statut === 'debiteur' ? 'deb' : s.statut === 'crediteur' ? 'cred' : 'mut'}>
          {s.statut === 'solde' ? 'Soldé' : fmt(Math.abs(Number(s.solde)), devise)}
        </strong>
      {/if}
    </a>
    {#if canEdit}<div class="actions"><button class="btn small" onclick={() => editer(c)}>Modifier</button></div>{/if}
  </div>
{:else}
  <p class="mut">Aucun commercial.</p>
{/each}
