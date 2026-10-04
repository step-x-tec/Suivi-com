<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { invoquer } from '$lib/fonctions';
  let { data } = $props();

  let statut = $state('verification');
  let erreur = $state('');
  let essais = 0;

  // Le webhook peut arriver quelques secondes après le retour : on revérifie un moment
  async function verifier() {
    const r = await invoquer<{ statut: string }>(data.supabase, 'paiement-verifier', { reference: data.ref });
    if (r.erreur || !r.data) { erreur = r.erreur ?? 'Vérification impossible.'; statut = 'erreur'; return; }
    statut = r.data.statut;
    if (statut === 'approuve') await invalidateAll(); // recharge le plan et les limites
    else if (statut === 'en_attente' && ++essais < 8) setTimeout(verifier, 4000);
  }
  onMount(verifier);
</script>

<h1>Paiement</h1>

{#if statut === 'verification' || (statut === 'en_attente' && essais < 8)}
  <div class="card"><strong>Vérification du paiement…</strong>
    <p class="mut">Confirmez la transaction sur votre téléphone si on vous le demande. Cela peut prendre quelques secondes.</p></div>
{:else if statut === 'approuve'}
  <div class="card"><strong class="ok">✓ Paiement reçu</strong>
    <p class="mut">Votre abonnement est actif.</p></div>
{:else if statut === 'en_attente'}
  <div class="card"><strong>Paiement toujours en attente</strong>
    <p class="mut">Nous n'avons pas encore reçu la confirmation. Si vous avez bien payé, elle sera prise en compte automatiquement dans quelques minutes.</p></div>
{:else if statut === 'refuse' || statut === 'annule'}
  <div class="card"><strong class="err">Paiement {statut === 'refuse' ? 'refusé' : 'annulé'}</strong>
    <p class="mut">Aucun montant n'a été débité par CommPro. Vous pouvez réessayer.</p></div>
{:else if statut === 'anomalie'}
  <div class="card"><strong class="err">Paiement à vérifier</strong>
    <p class="mut">Le montant reçu ne correspond pas. Contactez le support en indiquant la référence {data.ref}.</p></div>
{:else}
  <p class="err">{erreur}</p>
{/if}

<a class="btn" style="display:block;text-align:center;line-height:1.9;margin-top:1rem" href="/parametres">Retour aux paramètres</a>
