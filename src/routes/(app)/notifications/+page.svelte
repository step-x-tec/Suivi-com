<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { etat, chargerNonLues } from '$lib/etat.svelte';
  import { ICONES, tempsRelatif } from '$lib/notifications';
  let { data } = $props();
  let err = $state('');

  const nonLues = $derived(data.notifications.filter((n) => !n.read).length);

  async function ouvrir(n: { id: string; read: boolean; lien: string | null }) {
    if (!n.read) {
      const { error } = await data.supabase.from('notifications').update({ read: true }).eq('id', n.id);
      if (error) { err = error.message; return; }
      await chargerNonLues(data.supabase);
    }
    if (n.lien) await goto(n.lien); else await invalidateAll();
  }

  async function toutLu() {
    err = '';
    const { error } = await data.supabase.from('notifications').update({ read: true }).eq('read', false);
    if (error) { err = error.message; return; }
    await chargerNonLues(data.supabase);
    await invalidateAll();
  }
</script>

<h1>Notifications</h1>
<div class="row" style="margin-bottom:.8rem">
  <span class="mut">{nonLues} non lue(s)</span>
  <button class="btn small" disabled={nonLues === 0 || !etat.enLigne} onclick={toutLu}>Tout marquer comme lu</button>
</div>
{#if err}<p class="err">{err}</p>{/if}

{#each data.notifications as n (n.id)}
  <button class="card" style={`width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer;${n.read ? 'opacity:.65' : 'border-color:var(--acc)'}`}
    onclick={() => ouvrir(n)}>
    <div class="row" style="align-items:flex-start">
      <span>{ICONES[n.type] ?? '🔔'} {n.message}</span>
      {#if !n.read}<span class="dot" style="background:var(--acc);flex:none;margin:.4rem 0 0 .5rem"></span>{/if}
    </div>
    <div class="mut">{tempsRelatif(n.created_at)}</div>
  </button>
{:else}
  <p class="mut">Aucune notification pour le moment.</p>
{/each}
