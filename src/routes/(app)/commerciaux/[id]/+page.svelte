<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { fmt, dateCourte } from '$lib/format';
  import { appelerMembres } from '$lib/membres';
  let { data } = $props();
  const devise = $derived(data.profil.tenants.devise);
  const canEdit = $derived(['admin', 'manager'].includes(data.profil.role));
  const s = $derived(data.solde);
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
<h1>{data.c.nom}</h1>
<p class="mut">{[data.c.code, data.c.zone, data.c.groupes?.nom, data.c.telephone].filter(Boolean).join(' · ')}</p>

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

{#if canEdit}
  <div class="grid2">
    <a class="btn primary" style="text-align:center;line-height:1.9" href={`/cloture/${data.c.id}`}>◉ Clôture</a>
    <a class="btn" style="text-align:center;line-height:1.9" href={`/attributions?commercial=${data.c.id}`}>+ Attribuer</a>
  </div>
{/if}

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
