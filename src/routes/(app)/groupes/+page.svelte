<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  let { data } = $props();
  const canEdit = $derived(['admin', 'manager'].includes(data.profil.role));

  type F = { id?: string; nom: string; business: string; zone: string; description: string; color: string };
  let f = $state<F | null>(null);
  let busy = $state(false), err = $state('');

  const nouveau = () => { err = ''; f = { nom: '', business: '', zone: '', description: '', color: '#f5a524' }; };
  const editer = (g: any) => {
    err = '';
    f = { id: g.id, nom: g.nom, business: g.business ?? '', zone: g.zone ?? '', description: g.description ?? '', color: g.color ?? '#f5a524' };
  };

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (!f) return;
    busy = true; err = '';
    const { id, ...champs } = f;
    const { error } = id
      ? await data.supabase.from('groupes').update(champs).eq('id', id)
      : await data.supabase.from('groupes').insert({ ...champs, tenant_id: data.profil.tenant_id });
    busy = false;
    if (error) { err = error.message; return; }
    f = null;
    await invalidateAll();
  }

  async function archiver(g: any) {
    await data.supabase.from('groupes').update({ archived: !g.archived }).eq('id', g.id);
    await invalidateAll();
  }
</script>

<h1>Groupes</h1>

{#if f}
  <form class="card" onsubmit={enregistrer}>
    <label>Nom<input bind:value={f.nom} required /></label>
    <div class="grid2">
      <label>Secteur<input bind:value={f.business} /></label>
      <label>Zone<input bind:value={f.zone} /></label>
    </div>
    <label>Description<input bind:value={f.description} /></label>
    <label>Couleur<input type="color" bind:value={f.color} /></label>
    {#if err}<p class="err">{err}</p>{/if}
    <button class="btn primary" disabled={busy}>Enregistrer</button>
    <button type="button" class="btn" style="margin-top:.5rem" onclick={() => (f = null)}>Annuler</button>
  </form>
{:else if canEdit}
  <button class="btn primary fab" onclick={nouveau}>+ Nouveau groupe</button>
{/if}

{#each data.groupes as g (g.id)}
  <div class="card" style={g.archived ? 'opacity:.55' : ''}>
    <div class="row">
      <strong><span class="dot" style={`background:${g.color ?? 'var(--acc)'}`}></span>{g.nom}</strong>
      <span class="badge">{g.commerciaux?.[0]?.count ?? 0} commerciaux</span>
    </div>
    <div class="mut">{[g.business, g.zone].filter(Boolean).join(' · ')}</div>
    {#if canEdit}
      <div class="actions">
        <button class="btn small" onclick={() => editer(g)}>Modifier</button>
        <button class="btn small" onclick={() => archiver(g)}>{g.archived ? 'Restaurer' : 'Archiver'}</button>
      </div>
    {/if}
  </div>
{:else}
  <p class="mut">Aucun groupe pour l'instant.</p>
{/each}
