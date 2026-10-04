<script lang="ts">
  import { fmt, dateCourte } from '$lib/format';
  import { etat, rafraichir, synchroniser } from '$lib/etat.svelte';
  import { ajouterAction, listerActions, supprimerAction, type Action } from '$lib/file-attente';
  let { data } = $props();
  const devise = $derived(data.profil.tenants.devise);

  let actions = $state<Action[]>([]);
  async function charger() {
    try { actions = (await listerActions()).filter((a) => a.user_id === data.userId); } catch { actions = []; }
  }
  $effect(() => { etat.enAttente; etat.refuses; charger(); });

  async function reessayer(a: Action) {
    const { erreur, ...reste } = a; // retire le message de refus, remet en file
    await ajouterAction(reste);
    await rafraichir();
    await synchroniser(data.supabase, data.userId);
  }
  async function abandonner(a: Action) {
    if (!confirm('Abandonner cette action ? Elle ne sera jamais envoyée.')) return;
    await supprimerAction(a.id);
    await rafraichir();
  }
</script>

<h1>Synchronisation</h1>
<p class="mut">Actions enregistrées sur ce téléphone, en attente ou refusées par le serveur.</p>

{#each actions as a (a.id)}
  <div class="card" style={a.erreur ? 'border-color:var(--bad)' : 'border-style:dashed'}>
    <div class="row">
      <strong>Règlement · {fmt(Number(a.payload.montant), devise)}</strong>
      <span class="badge">{a.erreur ? 'Refusé' : 'En attente'}</span>
    </div>
    <div class="mut">{dateCourte(a.created_at)} · {a.payload.type}</div>
    {#if a.erreur}<p class="err">{a.erreur}</p>{/if}
    <div class="actions">
      {#if a.erreur}<button class="btn small" onclick={() => reessayer(a)}>Réessayer</button>{/if}
      <button class="btn small" onclick={() => abandonner(a)}>Abandonner</button>
    </div>
  </div>
{:else}
  <p class="mut">Rien en attente : tout est synchronisé.</p>
{/each}
