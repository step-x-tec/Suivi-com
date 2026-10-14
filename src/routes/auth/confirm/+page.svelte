<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { EmailOtpType } from '@supabase/supabase-js';
  let { data } = $props();

  // Lien des e-mails (invitation, confirmation, réinitialisation) : valide le jeton puis redirige.
  onMount(async () => {
    const u = page.url.searchParams;
    const token_hash = u.get('token_hash');
    const type = u.get('type') as EmailOtpType | null;
    const next = u.get('next') ?? '/';
    const cible = next.startsWith('/') && !next.startsWith('//') ? next : '/'; // pas de redirection externe
    if (token_hash && type) {
      const { error } = await data.supabase.auth.verifyOtp({ type, token_hash });
      if (!error) { await goto(cible, { replaceState: true, invalidateAll: true }); return; }
    }
    await goto('/login?erreur=lien', { replaceState: true });
  });
</script>

<div class="page"><p class="mut">Validation du lien en cours…</p></div>
