<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { fmt, dateCourte } from '$lib/format';
  import { LIBELLES, effet, impactReglements, mouvements, statutSolde, type Sens, type TypeReglement } from '$lib/credit';
  import { etat, rafraichir } from '$lib/etat.svelte';
  import { ajouterAction, listerActions, type Action } from '$lib/file-attente';
  let { data } = $props();

  const devise = $derived(data.profil.tenants.devise);
  const canEdit = $derived(['admin', 'manager'].includes(data.profil.role));
  const s = $derived(data.solde);
  // Règlements saisis hors ligne et pas encore envoyés : ils comptent déjà dans le solde affiché
  let enAttente = $state<Action[]>([]);
  async function chargerAttente() {
    try {
      enAttente = (await listerActions()).filter(
        (a) => a.payload.commercial_id === data.c.id && a.user_id === data.userId && !a.erreur);
    } catch { enAttente = []; }
  }
  $effect(() => { etat.enAttente; etat.refuses; chargerAttente(); });
  const impactAttente = $derived(impactReglements(enAttente.map((a) => a.payload as any)));
  const solde = $derived(Number(s?.solde ?? 0) + impactAttente);
  let infoHors = $state('');
  const liste = $derived(mouvements(data.clotures, data.reglements).reverse());

  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  type F = { type: TypeReglement; sens: Sens; montant: number | null | undefined; mode: string;
    reference: string; note: string; date: string; cloture_id: string };
  let f = $state<F | null>(null);
  let busy = $state(false), err = $state('');

  const nouveau = () => {
    err = '';
    f = { type: 'remise', sens: 'credit', montant: null, mode: 'especes', reference: '', note: '', date: aujourdhui(), cloture_id: '' };
  };

  const m = $derived(f && typeof f.montant === 'number' && f.montant > 0 ? f.montant : 0);
  const impact = $derived.by(() => {
    if (!f) return 0;
    const e = effet(f.type, f.sens, m);
    return e.debit - e.credit;
  });

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (!f || m <= 0) { err = 'Montant invalide.'; return; }
    busy = true; err = '';
    const ligne = {
      id: crypto.randomUUID(), // identifiant fixé ici : un renvoi ne peut jamais créer de doublon
      tenant_id: data.profil.tenant_id, commercial_id: data.c.id,
      cloture_id: f.cloture_id || null, type: f.type,
      sens: f.type === 'ajustement' ? f.sens : null,
      montant: m, mode: f.type === 'autre' ? null : f.mode,
      reference: f.reference.trim() || null, note: f.note.trim() || null,
      date_reglement: f.date, devise, created_by: data.userId
    };
    let horsLigne = !navigator.onLine;
    if (!horsLigne) {
      const { error } = await data.supabase.from('reglements').upsert(ligne, { onConflict: 'id', ignoreDuplicates: true });
      if (error?.code === 'HORS_LIGNE') horsLigne = true;
      else if (error) { busy = false; err = error.message; return; }
    }
    if (horsLigne) {
      await ajouterAction({ id: ligne.id, user_id: data.userId, table: 'reglements', payload: ligne, created_at: new Date().toISOString() });
      await rafraichir();
      infoHors = 'Règlement enregistré sur ce téléphone. Il sera envoyé automatiquement au retour du réseau.';
    }
    busy = false;
    f = null;
    await invalidateAll();
  }

  async function marquerSolde() {
    if (solde === 0) return;
    if (!confirm(`Solder le compte (${fmt(Math.abs(solde), devise)}) par un ajustement ?`)) return;
    const { error } = await data.supabase.from('reglements').insert({
      tenant_id: data.profil.tenant_id, commercial_id: data.c.id, type: 'ajustement',
      sens: solde > 0 ? 'credit' : 'debit', montant: Math.abs(solde),
      note: 'Solde clôturé', date_reglement: aujourdhui(), devise, created_by: data.userId
    });
    if (error) err = error.message;
    await invalidateAll();
  }
</script>

<a href="/credit" class="mut">‹ Crédit</a>
<h1>{data.c.nom}</h1>

<div class="card">
  <div class="row">
    <span>{statutSolde(solde) === 'debiteur' ? 'Doit' : statutSolde(solde) === 'crediteur' ? 'À payer' : 'Compte'}</span>
    <span class="net">{solde === 0 ? 'Soldé' : fmt(Math.abs(solde), devise)}</span>
  </div>
  {#if s}
    <table style="margin-top:.5rem">
      <tbody>
        <tr><td>Total clôtures</td><td>{fmt(Number(s.total_clotures), devise)}</td></tr>
        <tr><td>Remises + avances</td><td>− {fmt(Number(s.total_remises) + Number(s.total_avances), devise)}</td></tr>
        <tr><td>Frais dus</td><td>+ {fmt(Number(s.total_frais), devise)}</td></tr>
        <tr><td>Retours</td><td>− {fmt(Number(s.total_retours), devise)}</td></tr>
        <tr><td>Ajustements</td><td>{Number(s.total_ajustements) >= 0 ? '+' : '−'} {fmt(Math.abs(Number(s.total_ajustements)), devise)}</td></tr>
      </tbody>
    </table>
  {/if}
</div>

{#if f}
  <form class="card" onsubmit={enregistrer}>
    <label>Type
      <select bind:value={f.type}>
        {#each Object.entries(LIBELLES) as [k, l]}<option value={k}>{l}</option>{/each}
      </select>
    </label>
    {#if f.type === 'ajustement'}
      <label>Sens
        <select bind:value={f.sens}>
          <option value="credit">Crédit (réduit la dette)</option>
          <option value="debit">Débit (augmente la dette)</option>
        </select>
      </label>
    {/if}
    <label>Montant<input type="number" inputmode="decimal" min="0" step="any" bind:value={f.montant} required /></label>
    {#if f.type !== 'autre'}
      <div class="grid2">
        <label>Mode
          <select bind:value={f.mode}>
            <option value="especes">Espèces</option><option value="mobile">Mobile Money</option>
            <option value="virement">Virement</option><option value="cheque">Chèque</option><option value="autre">Autre</option>
          </select>
        </label>
        <label>Date<input type="date" bind:value={f.date} required /></label>
      </div>
    {:else}
      <label>Date<input type="date" bind:value={f.date} required /></label>
    {/if}
    <label>Clôture associée
      <select bind:value={f.cloture_id}>
        <option value="">Aucune</option>
        {#each data.clotures as k}<option value={k.id}>{k.reference}</option>{/each}
      </select>
    </label>
    <label>Référence transaction<input bind:value={f.reference} /></label>
    <label>Note<input bind:value={f.note} /></label>
    <div class="card" style="margin:.4rem 0">
      <div class="row"><span class="mut">Solde actuel</span><span>{solde === 0 ? 'Soldé' : fmt(Math.abs(solde), devise) + (solde > 0 ? ' dû' : ' à payer')}</span></div>
      <div class="row"><span class="mut">Après ce mouvement</span>
        <strong>{solde + impact === 0 ? 'Soldé' : fmt(Math.abs(solde + impact), devise) + (solde + impact > 0 ? ' dû' : ' à payer')}</strong></div>
      {#if f.type === 'autre'}<div class="mut">Ce type n'a pas d'effet sur le solde.</div>{/if}
    </div>
    {#if !etat.enLigne}<p class="mut">Hors ligne : le règlement sera gardé sur ce téléphone puis envoyé automatiquement.</p>{/if}
    {#if err}<p class="err">{err}</p>{/if}
    <button class="btn primary" disabled={busy}>Enregistrer</button>
    <button type="button" class="btn" style="margin-top:.5rem" onclick={() => (f = null)}>Annuler</button>
  </form>
{:else}
  {#if canEdit}
    <div class="grid2" style="margin-bottom:.6rem">
      <button class="btn primary" onclick={nouveau}>+ Règlement</button>
      <button class="btn" disabled={solde === 0 || !etat.enLigne} onclick={marquerSolde}>✓ Marquer soldé</button>
    </div>
  {/if}
  <a class="btn" style="display:block;text-align:center;line-height:1.9" href={`/credit/${data.c.id}/releve`}>⎙ Relevé de compte</a>
  {#if err}<p class="err">{err}</p>{/if}
  {#if infoHors}<p class="ok">{infoHors}</p>{/if}
{/if}

<h2>Mouvements</h2>
{#each enAttente as a (a.id)}
  <div class="card row" style="border-style:dashed">
    <div>
      <strong>{LIBELLES[a.payload.type as TypeReglement]?.replace(/^\S+\s/, '') ?? 'Règlement'}</strong>
      <div class="mut">⟳ en attente d'envoi</div>
    </div>
    <strong>{fmt(Number(a.payload.montant), devise)}</strong>
  </div>
{/each}
{#each liste as x (x.kind + x.id)}
  <div class="card row">
    <div>
      <strong>{x.libelle}</strong>
      <div class="mut">{dateCourte(x.date)}</div>
    </div>
    <strong class={x.debit > 0 ? 'deb' : x.credit > 0 ? 'cred' : 'mut'}>
      {x.debit > 0 ? '+' : x.credit > 0 ? '−' : ''}{fmt(x.debit || x.credit, devise)}
    </strong>
  </div>
{:else}
  <p class="mut">Aucun mouvement.</p>
{/each}
