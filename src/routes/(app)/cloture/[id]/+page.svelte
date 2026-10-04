<script lang="ts">
  import { goto } from '$app/navigation';
  import { calcCloture, type Method } from '$lib/calc';
  import { fmt } from '$lib/format';
  import { etat } from '$lib/etat.svelte';
  let { data } = $props();

  const devise = $derived(data.profil.tenants.devise);
  let method = $state<Method>('rest');
  let saisies = $state<Record<string, number | null | undefined>>({});
  let defauts = $state<Record<string, number | null | undefined>>({});
  let divers = $state<{ label: string; montant: number | null | undefined }[]>([]);
  let note = $state('');
  let etape = $state<'saisie' | 'resume'>('saisie');
  let busy = $state(false), erreur = $state('');

  const entier = (v: number | null | undefined) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null;
  const montant = (v: number | null | undefined) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0;

  const calc = $derived(
    calcCloture(
      data.attributions.map((a) => ({
        id: a.id, qtyAvant: a.qty_rest, prix: Number(a.prix), pct: Number(a.pct),
        saisie: entier(saisies[a.id]), defauts: entier(defauts[a.id]) ?? 0
      })),
      method,
      divers.map((d) => montant(d.montant)),
      devise
    )
  );
  const parId = $derived(new Map(calc.lines.map((r) => [r.id, r])));

  async function valider() {
    busy = true; erreur = '';
    const lignes = data.attributions
      .filter((a) => entier(saisies[a.id]) !== null)
      .map((a) => ({ attribution_id: a.id, saisie: entier(saisies[a.id]), defauts: entier(defauts[a.id]) ?? 0 }));
    const { data: id, error } = await data.supabase.rpc('creer_cloture', {
      p_commercial_id: data.commercial.id,
      p_method: method,
      p_lines: lignes,
      p_divers: divers
        .filter((d) => d.label.trim() && montant(d.montant) > 0)
        .map((d) => ({ label: d.label.trim(), montant: montant(d.montant) })),
      p_note: note.trim() || null
    });
    busy = false;
    if (error) { erreur = error.message; etape = 'saisie'; return; }
    await goto(`/recu/${id}`);
  }
</script>

<a href="/cloture" class="mut">‹ Retour</a>
<h1>{data.commercial.nom}</h1>

{#if data.attributions.length === 0}
  <p class="mut">Aucun article en stock chez ce commercial.</p>
{:else if etape === 'saisie'}
  <div class="seg">
    <button class:on={method === 'rest'} onclick={() => (method = 'rest')}>Restants</button>
    <button class:on={method === 'vend'} onclick={() => (method = 'vend')}>Vendus</button>
  </div>

  {#each data.attributions as a (a.id)}
    {@const r = parId.get(a.id)}
    <section class="card">
      <div class="row">
        <strong>{a.nom}</strong><span class="badge">{a.qty_rest} en stock</span>
      </div>
      <div class="grid2" style="margin-top:.6rem">
        <label>{method === 'rest' ? 'Restants' : 'Vendus'}
          <input type="number" inputmode="numeric" min="0" bind:value={saisies[a.id]} />
        </label>
        <label>Défauts
          <input type="number" inputmode="numeric" min="0" bind:value={defauts[a.id]} />
        </label>
      </div>
      {#if r?.ok}
        <div class="mut">{r.vendValides} vendu(s) valide(s){r.vend > r.vendValides ? ` + ${r.vend - r.vendValides} défaut(s)` : ''} · stock après : {r.rest} · commission {fmt(r.commission, devise)}</div>
        <strong>Dû : {fmt(r.du, devise)}</strong>
      {:else if r}
        <div class="err">{r.erreur}</div>
      {/if}
    </section>
  {/each}

  <h2>Déductions diverses</h2>
  {#each divers as d, i}
    <div class="grid2">
      <label>Libellé<input bind:value={d.label} placeholder="Déplacement…" /></label>
      <label>Montant<input type="number" inputmode="numeric" min="0" bind:value={d.montant} /></label>
    </div>
    <button class="btn small" onclick={() => divers.splice(i, 1)}>Retirer</button>
  {/each}
  <button class="btn" onclick={() => divers.push({ label: '', montant: null })}>+ Ajouter une déduction</button>

  <label style="margin-top:1rem">Note<input bind:value={note} /></label>

  <div class="card">
    <div class="row"><span>Net à payer</span><span class="net">{fmt(calc.net, devise)}</span></div>
  </div>
  {#if erreur}<p class="err">{erreur}</p>{/if}
  <button class="btn primary" disabled={!calc.valid} onclick={() => (etape = 'resume')}>Voir le résumé</button>
{:else}
  <div class="card">
    <div class="row"><span>Brut total ventes</span><strong>{fmt(calc.brut, devise)}</strong></div>
    <div class="row"><span>− Commissions</span><strong>{fmt(calc.commissions, devise)}</strong></div>
    {#if calc.defauts > 0}<div class="row"><span>− Articles défauts</span><strong>{fmt(calc.defauts, devise)}</strong></div>{/if}
    <div class="row"><span>− Divers</span><strong>{fmt(calc.divers, devise)}</strong></div>
    <hr style="border-color:var(--line)" />
    <div class="row"><span>Net à payer</span><span class="net">{fmt(calc.net, devise)}</span></div>
    {#if calc.net < 0}<div class="mut">Net négatif : les déductions dépassent le montant dû, la différence est créditée au commercial.</div>{/if}
  </div>
  {#if !etat.enLigne}
    <p class="err">Hors ligne : la clôture nécessite une connexion (stock et numéro de reçu vérifiés par le serveur). Vos saisies sont conservées sur cet écran.</p>
  {/if}
  <button class="btn primary" disabled={busy || !etat.enLigne} onclick={valider}>{busy ? 'Validation…' : 'Confirmer la clôture'}</button>
  <button class="btn" style="margin-top:.5rem" disabled={busy} onclick={() => (etape = 'saisie')}>Modifier</button>
{/if}
