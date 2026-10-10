<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { fmt, dateCourte } from '$lib/format';
  import { appelerMembres } from '$lib/membres';
  import { LIBELLES, effet, type TypeReglement } from '$lib/credit';
  import { initiales } from '$lib/commerciaux';
  let { data } = $props();
  const devise = $derived(data.profil.tenants.devise);
  const canEdit = $derived(['admin', 'manager'].includes(data.profil.role));
  const s = $derived(data.solde);
  const initial = $derived(data.attributions.reduce((t, a) => t + a.qty_initial, 0));
  const restant = $derived(data.attributions.reduce((t, a) => t + a.qty_rest, 0));
  const ecoulement = $derived(initial > 0 ? Math.round(((initial - restant) / initial) * 100) : 0);
  const valeurStock = $derived(data.attributions.reduce((t, a) => t + a.qty_rest * Number(a.prix), 0));
  const isAdmin = $derived(data.profil.role === 'admin');
  let invMsg = $state(''), invErr = $state(''), invBusy = $state(false);

  async function inviterPortail() {
    invBusy = true; invMsg = ''; invErr = '';
    const m = await appelerMembres(data.supabase, {
      email: data.c.email, nom: data.c.nom, role: 'commercial', commercial_id: data.c.id
    });
    invBusy = false;
    if (m) invErr = m; else invMsg = `Invitation envoyée à ${data.c.email}.`;
    await invalidateAll();
  }
</script>

<a href="/commerciaux" class="mut">‹ Commerciaux</a>
<div class="row" style="justify-content:flex-start;gap:.8rem;margin:.4rem 0 1rem">
  <span class="avatar" style="width:52px;height:52px;font-size:1.1rem">{initiales(data.c.nom)}</span>
  <div>
    <h1 style="margin:0">{data.c.nom}</h1>
    <div class="mut">{[data.c.code, data.c.zone, data.c.groupes?.nom, data.c.telephone].filter(Boolean).join(' · ')}</div>
  </div>
</div>

{#if s}
  <div class="card">
    <div class="row">
      <span>{s.statut === 'debiteur' ? 'Doit' : s.statut === 'crediteur' ? 'À payer' : 'Solde'}</span>
      <span class="net">{s.statut === 'solde' ? 'Soldé' : fmt(Math.abs(Number(s.solde)), devise)}</span>
    </div>
    <div class="mut">Clôtures {fmt(Number(s.total_clotures), devise)} · Remises/avances
      {fmt(Number(s.total_remises) + Number(s.total_avances), devise)}</div>
  </div>
{/if}

<div class="grid2" style="margin-bottom:.8rem">
  {#if canEdit}
    <a class="btn primary" style="text-align:center;line-height:1.9" href={`/cloture/${data.c.id}`}>◉ Clôture</a>
    <a class="btn" style="text-align:center;line-height:1.9" href={`/attributions?commercial=${data.c.id}`}>+ Attribuer</a>
    <a class="btn" style="text-align:center;line-height:1.9" href={`/credit/${data.c.id}?reglement=1`}>+ Règlement</a>
  {/if}
  <a class="btn" style="text-align:center;line-height:1.9" href={`/credit/${data.c.id}/releve`}>⎙ Relevé</a>
</div>

<h2>Résumé</h2>
<div class="card">
  <div class="row"><span class="mut">Stock chez le commercial</span><strong>{restant} article(s) · {fmt(valeurStock, devise)}</strong></div>
  <div class="row"><span class="mut">Taux d'écoulement</span><strong>{ecoulement} %</strong></div>
  <div class="bar"><i style={`width:${ecoulement}%`}></i></div>
  {#if s}
    <div class="row"><span class="mut">Frais · retours · ajustements</span>
      <span>{fmt(Number(s.total_frais), devise)} · {fmt(Number(s.total_retours), devise)} · {fmt(Number(s.total_ajustements), devise)}</span></div>
  {/if}
  {#if data.clotures[0]}<div class="row"><span class="mut">Dernière clôture</span><span>{dateCourte(data.clotures[0].created_at)}</span></div>{/if}
  {#if data.reglements[0]}<div class="row"><span class="mut">Dernier règlement</span><span>{dateCourte(data.reglements[0].date_reglement)}</span></div>{/if}
</div>

{#if isAdmin}
  {#if data.c.portal_access}
    <p class="mut">✓ Accès au portail actif</p>
  {:else if data.c.email}
    <button class="btn" style="margin-top:.6rem" disabled={invBusy} onclick={inviterPortail}>Inviter au portail commercial</button>
  {:else}
    <p class="mut">Ajoutez un email à la fiche pour l'inviter au portail.</p>
  {/if}
  {#if invErr}<p class="err">{invErr}</p>{/if}
  {#if invMsg}<p class="ok">{invMsg}</p>{/if}
{/if}

<h2>Attributions</h2>
{#each data.attributions as a (a.id)}
  <div class="card">
    <div class="row"><strong>{a.nom}</strong><span class="badge">{a.qty_rest} / {a.qty_initial}</span></div>
    <div class="bar"><i style={`width:${a.qty_initial ? Math.round(((a.qty_initial - a.qty_rest) / a.qty_initial) * 100) : 0}%`}></i></div>
  </div>
{:else}<p class="mut">Aucune attribution.</p>{/each}

<h2>Dernières clôtures</h2>
{#each data.clotures as k (k.id)}
  <a class="card row" href={`/recu/${k.id}`}>
    <div><strong>{k.reference}</strong><div class="mut">{dateCourte(k.created_at)}{k.status === 'annulee' ? ' · annulée' : ''}</div></div>
    <strong>{fmt(Number(k.net_final), devise)}</strong>
  </a>
{:else}<p class="mut">Aucune clôture.</p>{/each}

<div class="row"><h2 style="margin:1.2rem 0 .6rem">Derniers règlements</h2><a class="mut" href={`/credit/${data.c.id}`}>Tout voir ›</a></div>
{#each data.reglements as r (r.id)}
  {@const e = effet(r.type as TypeReglement, r.sens, Number(r.montant))}
  <div class="card row">
    <div>
      <strong>{(LIBELLES[r.type as TypeReglement] ?? r.type).replace(/^\S+\s/, '')}</strong>
      <div class="mut">{dateCourte(r.date_reglement)}{r.mode ? ` · ${r.mode}` : ''}{r.reference ? ` · ${r.reference}` : ''}</div>
    </div>
    <strong class={e.debit > 0 ? 'deb' : e.credit > 0 ? 'cred' : 'mut'}>{e.debit > 0 ? '+' : e.credit > 0 ? '−' : ''}{fmt(Number(r.montant), devise)}</strong>
  </div>
{:else}<p class="mut">Aucun règlement.</p>{/each}
