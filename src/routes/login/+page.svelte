<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { adresseDejaInscrite, messageAuth } from '$lib/auth-erreurs';
  let { data } = $props();

  let mode = $state<'connexion' | 'inscription'>('connexion');
  let email = $state(''), password = $state('');
  let entreprise = $state(''), nom = $state(''), phone = $state('');
  let pays = $state('Togo'), devise = $state('CFA');
  let busy = $state(false), err = $state(''), msg = $state('');
  let peutRenvoyer = $state(false);

  async function reinitialiser() {
    err = ''; msg = '';
    if (!email) { err = "Saisissez d'abord votre email."; return; }
    const { error } = await data.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/bienvenue`
    });
    if (error) err = messageAuth(error).texte;
    else msg = 'Si ce compte existe, un e-mail de réinitialisation vient d\'être envoyé (pensez au dossier spam).';
  }

  async function renvoyerConfirmation() {
    err = ''; msg = '';
    if (!email) { err = "Saisissez d'abord votre e-mail."; return; }
    const { error } = await data.supabase.auth.resend({
      type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) { const m = messageAuth(error); err = m.texte; peutRenvoyer = m.peutRenvoyer; }
    else msg = 'Nouveau message envoyé. Vérifiez votre boîte de réception et le dossier spam (cela peut prendre quelques minutes).';
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true; err = ''; msg = ''; peutRenvoyer = false;
    const auth = data.supabase.auth;
    if (mode === 'connexion') {
      const { error } = await auth.signInWithPassword({ email, password });
      if (error) { const m = messageAuth(error); err = m.texte; peutRenvoyer = m.peutRenvoyer; }
      else await goto('/', { invalidateAll: true });
    } else {
      const { data: res, error } = await auth.signUp({
        email, password,
        options: { data: { entreprise, nom, phone, pays, devise }, emailRedirectTo: `${window.location.origin}/auth/callback` }
      });
      if (error) { const m = messageAuth(error); err = m.texte; peutRenvoyer = m.peutRenvoyer; }
      else if (res.session) await goto('/', { invalidateAll: true });
      else if (adresseDejaInscrite(res.user)) { err = messageAuth({ code: 'user_already_exists' }).texte; peutRenvoyer = true; }
      else { msg = `Compte créé. Un message de confirmation vient d'être envoyé à ${email} : ouvrez-le (pensez au dossier spam), puis connectez-vous.`; peutRenvoyer = true; }
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
    {#if page.url.searchParams.get('erreur') === 'lien'}<p class="err">Lien expiré, déjà utilisé ou ouvert sur un autre appareil. Si votre adresse est confirmée, connectez-vous simplement.</p>{/if}
    {#if err}<p class="err">{err}</p>{/if}
    {#if msg}<p class="ok">{msg}</p>{/if}
    {#if peutRenvoyer}
      <button type="button" class="btn small" style="margin-bottom:.6rem" onclick={renvoyerConfirmation}>Renvoyer l'e-mail de confirmation</button>
    {/if}
    <button class="btn primary" disabled={busy}>
      {busy ? '…' : mode === 'connexion' ? 'Se connecter' : "Créer mon compte"}
    </button>
  </form>
</div>
