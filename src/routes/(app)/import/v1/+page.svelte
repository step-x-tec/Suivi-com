<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { normaliserV1, type ResultatV1 } from '$lib/import-v1';
  let { data } = $props();

  const admin = $derived(data.profil.role === 'admin');
  const devise = $derived(data.profil.tenants.devise);
  let nomFichier = $state('');
  let analyse = $state<ResultatV1 | null>(null);
  let confirme = $state(false);
  let busy = $state(false), err = $state('');
  let bilan = $state<Record<string, number> | null>(null);

  const LIBELLES: Record<string, string> = { groupes: 'groupe(s)', articles: 'article(s)', commerciaux: 'commercial(aux)',
    attributions: 'attribution(s)', clotures: 'clôture(s)', reglements: 'règlement(s)', ignores: 'élément(s) ignoré(s)' };

  async function lire(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    err = ''; analyse = null; bilan = null; confirme = false;
    if (!f) return;
    if (f.size > 8_000_000) { err = 'Fichier trop volumineux (8 Mo maximum).'; return; }
    try {
      analyse = normaliserV1(JSON.parse(await f.text()));
      nomFichier = f.name;
    } catch {
      err = "Ce fichier n'est pas un JSON valide. Utilisez le bouton « ↓ JSON » du prototype CommPro v1.";
    }
  }

  const memeDevise = $derived(() => {
    const v1 = analyse?.deviseV1;
    if (!v1) return true;
    const cfa = ['FCFA', 'CFA', 'XOF'];
    return (cfa.includes(v1) && cfa.includes(devise)) || v1 === devise || (v1 === '$' && devise === 'USD') || (v1 === '€' && devise === 'EUR');
  });

  // Les quotas du plan s'appliquent à l'import : commerciaux actifs et nombre de membres
  const actifs = $derived(analyse?.payload ? analyse.payload.commerciaux.filter((c: any) => c.status === 'actif').length : 0);
  const limite = $derived(data.quota?.limites.commerciaux ?? null);
  const depasse = $derived(limite !== null && actifs > limite);

  async function importer() {
    if (!analyse?.payload) return;
    if (!navigator.onLine) { err = "L'import nécessite une connexion internet."; return; }
    busy = true; err = '';
    const { data: res, error } = await data.supabase.rpc('importer_v1', { p: analyse.payload });
    busy = false;
    if (error) { err = error.message; return; }
    bilan = res as Record<string, number>;
    analyse = null;
    await invalidateAll();
  }
</script>

<a href="/import" class="mut">‹ Importer des données</a>
<h1>Importer depuis CommPro v1</h1>

{#if !admin}
  <p class="err">Réservé à l'administrateur du compte.</p>
{:else if bilan}
  <div class="card">
    <strong class="ok">✓ Import terminé</strong>
    <p>{Object.entries(bilan).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${LIBELLES[k] ?? k}`).join(' · ')}</p>
    <a class="btn small" href="/">Voir le tableau de bord</a>
  </div>
{:else if data.present.length}
  <div class="card">
    <strong class="err">Ce compte contient déjà des données</strong>
    <p class="mut">L'import du prototype n'est possible que sur un compte vide, pour ne jamais créer de doublons. Déjà présent :
      {data.present.map((x) => `${x.n} ${LIBELLES[x.t]}`).join(', ')}.</p>
  </div>
{:else}
  <div class="card">
    <ol class="mut" style="margin:0 0 .8rem;padding-left:1.2rem">
      <li>Dans le prototype CommPro v1, cliquez sur <strong>↓ JSON</strong> (ou la sauvegarde).</li>
      <li>Choisissez ce fichier ci-dessous : rien n'est écrit avant votre confirmation.</li>
    </ol>
    <label>Fichier de sauvegarde du prototype (.json)
      <input type="file" accept=".json,application/json" onchange={lire} />
    </label>
    {#if err}<p class="err">{err}</p>{/if}
  </div>

  {#if analyse?.erreur}
    <p class="err">{analyse.erreur}</p>
  {:else if analyse?.payload}
    <h2>{nomFichier}</h2>
    <div class="card">
      {#each Object.entries(analyse.resume) as [k, n]}
        <div class="row"><span>{LIBELLES[k]}</span><strong>{n}</strong></div>
      {/each}
    </div>

    {#if analyse.avertissements.length}
      <div class="card">
        <strong>À savoir</strong>
        {#each analyse.avertissements as a}<div class="mut">• {a}</div>{/each}
      </div>
    {/if}
    {#if !memeDevise()}
      <p class="err">Le prototype utilisait {analyse.deviseV1} mais ce compte est en {devise} : les montants sont repris tels quels, sans conversion. Changez la devise dans Paramètres avant d'importer si besoin.</p>
    {/if}
    {#if depasse}
      <p class="err">Votre plan autorise {limite} commerciaux actifs, le fichier en contient {actifs}. Passez à un plan supérieur avant d'importer.</p>
    {/if}

    <div class="card">
      <p class="mut" style="margin-top:0">Les clôtures reprennent leurs montants d'origine et reçoivent de nouveaux numéros de reçu (REC-AAAAMM-XXXX) dans l'ordre chronologique. L'historique est importé sans notification ni limite mensuelle. <strong>L'import est tout ou rien et ne peut pas être annulé.</strong></p>
      <label style="display:flex;align-items:center;gap:.6rem;color:var(--txt)">
        <input type="checkbox" bind:checked={confirme} style="width:auto;min-height:0;margin:0" />
        J'ai vérifié ce résumé et je veux importer ces données
      </label>
    </div>
    <button class="btn primary" disabled={!confirme || busy || depasse} onclick={importer}>
      {busy ? 'Import en cours…' : 'Importer mes données v1'}
    </button>
  {/if}
{/if}
