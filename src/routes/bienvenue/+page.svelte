<script lang="ts">
  import { goto } from '$app/navigation';
  let { data } = $props();
  let mdp = $state(''), mdp2 = $state('');
  let busy = $state(false), err = $state('');

  async function valider(e: SubmitEvent) {
    e.preventDefault();
    if (mdp !== mdp2) { err = 'Les mots de passe ne correspondent pas.'; return; }
    busy = true; err = '';
    const { error } = await data.supabase.auth.updateUser({ password: mdp });
    busy = false;
    if (error) { err = error.message; return; }
    await goto('/', { invalidateAll: true });
  }
</script>

<div class="page">
  <h1>Bienvenue sur CommPro</h1>
  {#if data.session}
    <p class="mut">Choisissez votre mot de passe pour accéder à votre espace.</p>
    <form onsubmit={valider}>
      <label>Mot de passe<input type="password" bind:value={mdp} required minlength="8" autocomplete="new-password" /></label>
      <label>Confirmer<input type="password" bind:value={mdp2} required minlength="8" autocomplete="new-password" /></label>
      {#if err}<p class="err">{err}</p>{/if}
      <button class="btn primary" disabled={busy}>Enregistrer</button>
    </form>
  {:else}
    <p class="err">Lien expiré ou invalide. Demandez une nouvelle invitation à votre responsable.</p>
    <a class="btn" style="display:block;text-align:center;line-height:1.9" href="/login">Aller à la connexion</a>
  {/if}
</div>
