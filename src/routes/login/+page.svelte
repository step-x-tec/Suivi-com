<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  let { data } = $props();

  let mode = $state<'connexion' | 'inscription'>('connexion');
  let email = $state(''), password = $state('');
  let entreprise = $state(''), nom = $state(''), phone = $state('');
  let pays = $state('Togo'), devise = $state('CFA');
  let busy = $state(false), err = $state(''), msg = $state('');

  async function reinitialiser() {
    err = ''; msg = '';
    if (!email) { err = "Saisissez d'abord votre email."; return; }
    const { error } = await data.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/bienvenue`
    });
    if (error) err = error.message;
    else msg = 'Si ce compte existe, un email de réinitialisation vient d\'être envoyé.';
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true; err = ''; msg = '';
    const auth = data.supabase.auth;
    if (mode === 'connexion') {
      const { error } = await auth.signInWithPassword({ email, password });
      if (error) err = 'Email ou mot de passe incorrect.';
      else await goto('/', { invalidateAll: true });
    } else {
      const { data: res, error } = await auth.signUp({
        email, password,
        options: { data: { entreprise, nom, phone, pays, devise } }
      });
      if (error) err = error.message;
      else if (res.session) await goto('/', { invalidateAll: true });
      else msg = 'Compte créé. Confirmez votre email, puis connectez-vous.';
    }
    busy = false;
  }
</script>

<div class="page">
  <h1>CommPro</h1>
  <div class="seg">
    <button class:on={mode === 'connexion'} onclick={() => (mode = 'connexion')}>Connexion</button>
    <button class:on={mode === 'inscription'} onclick={() => (mode = 'inscription')}>Inscription</button>
  </div>

  <form onsubmit={submit}>
    {#if mode === 'inscription'}
      <label>Nom de l'entreprise<input bind:value={entreprise} required autocomplete="organization" /></label>
      <label>Votre nom<input bind:value={nom} required autocomplete="name" /></label>
      <label>Téléphone<input bind:value={phone} type="tel" autocomplete="tel" /></label>
      <div class="grid2">
        <label>Pays<input bind:value={pays} /></label>
        <label>Devise
          <select bind:value={devise}>
            <option>CFA</option><option>USD</option><option>EUR</option><option>GHS</option>
          </select>
        </label>
      </div>
    {/if}
    <label>Email<input bind:value={email} type="email" required autocomplete="email" /></label>
    <label>Mot de passe
      <input bind:value={password} type="password" required minlength="8"
        autocomplete={mode === 'connexion' ? 'current-password' : 'new-password'} />
    </label>
    {#if mode === 'connexion'}
      <button type="button" class="btn small" style="margin-bottom:.6rem" onclick={reinitialiser}>Mot de passe oublié ?</button>
    {/if}
    {#if page.url.searchParams.get('erreur') === 'lien'}<p class="err">Lien expiré ou invalide.</p>{/if}
    {#if err}<p class="err">{err}</p>{/if}
    {#if msg}<p class="ok">{msg}</p>{/if}
    <button class="btn primary" disabled={busy}>
      {busy ? '…' : mode === 'connexion' ? 'Se connecter' : "Créer mon compte"}
    </button>
  </form>
</div>
