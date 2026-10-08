<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="page" style="padding-bottom:2rem">
  <h1>{page.status === 404 ? 'Page introuvable' : 'Un problème est survenu'}</h1>
  <p class="mut">{page.error?.message ?? ''}</p>
  <a class="btn primary" href="/" style="display:block;text-align:center;line-height:1.9;margin-bottom:.5rem">Retour à l'accueil</a>
  <button class="btn" onclick={() => location.reload()}>Réessayer</button>
</div>
