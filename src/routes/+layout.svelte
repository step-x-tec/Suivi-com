<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { invalidate } from '$app/navigation';
  let { data, children } = $props();

  onMount(() => {
    const { data: sub } = data.supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.expires_at !== data.session?.expires_at) invalidate('supabase:auth');
    });
    return () => sub.subscription.unsubscribe();
  });
</script>

{@render children()}
