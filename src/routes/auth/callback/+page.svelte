<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  let { data } = $props();

  // Retour des liens d'e-mail du modèle PAR DÉFAUT de Supabase : l'adresse arrive avec ?code=… qu'on échange contre une session.
  onMount(async () => {
    const u = page.url.searchParams;
    const code = u.get('code');
    const next = u.get('next') ?? '/';
    const cible = next.startsWith('/') && !next.startsWith('//') ? next : '/';
    if (code) {
      const { error } = await data.supabase.auth.exchangeCodeForSession(code);
      if (!error) { await goto(cible, { replaceState: true, invalidateAll: true }); return; }
    }
    await goto('/login?erreur=lien', { replaceState: true });
  });
</script>

<div class="page"><p class="mut">Validation du lien en cours…</p></div>
