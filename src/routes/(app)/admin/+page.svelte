<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { fmt, dateCourte } from '$lib/format';
  import { etatAbonnement, filtrerEntreprises } from '$lib/admin';
  let { data } = $props();

  const PLANS: Record<string, string> = { free: 'Gratuit', starter: 'Starter', pro: 'Pro', business: 'Business' };
  let q = $state(''), planFiltre = $state('');
  let ouverte = $state<string | null>(null);
  let plan = $state('pro'), jours = $state(30);
  let busy = $state(false), err = $state(''), msg = $state('');

  const liste = $derived(filtrerEntreprises(data.entreprises, q, planFiltre));
  const payantes = $derived(data.entreprises.filter((e) => e.plan_effectif !== 'free').length);
  const asurveiller = $derived(data.entreprises.filter((e) => ['attention', 'alerte'].includes(etatAbonnement(e).gravite)).length);

  function ouvrir(e: { id: string; plan: string }) {
    err = ''; msg = '';
    ouverte = ouverte === e.id ? null : e.id;
    plan = e.plan === 'free' ? 'pro' : e.plan;
  }

  async function appliquer(e: { id: string; nom: string }) {
    const duree = plan === 'free' ? 'sans échéance' : `${jours} jours à partir d'aujourd'hui`;
    if (!confirm(`Passer « ${e.nom} » au plan ${PLANS[plan]} (${duree}) ?\nL'entreprise en sera informée par une notification.`)) return;
    busy = true; err = ''; msg = '';
    const { error } = await data.supabase.rpc('admin_changer_plan', { p_tenant: e.id, p_plan: plan, p_jours: Number(jours) });
    busy = false;
    if (error) { err = error.message; return; }
    msg = `« ${e.nom} » est maintenant au plan ${PLANS[plan]}.`;
    ouverte = null;
    await invalidateAll();
  }
</script>

<a href="/plus" class="mut">‹ Plus</a>
<h1>Espace STEP-X</h1>

<div class="grid2">
  <div class="card"><div class="mut">Entreprises</div><div class="net">{data.entreprises.length}</div></div>
  <div class="card"><div class="mut">Abonnements payants</div><strong>{payantes}</strong></div>
  <div class="card"><div class="mut">À surveiller (échéance proche ou dépassée)</div><strong class={asurveiller ? 'deb' : ''}>{asurveiller}</strong></div>
  <div class="card"><div class="mut">Gratuit</div><strong>{data.entreprises.length - payantes}</strong></div>
</div>
{#if msg}<p class="ok">{msg}</p>{/if}

<input placeholder="Rechercher (nom, e-mail, téléphone, pays)…" bind:value={q} style="margin-top:.8rem" />
<select bind:value={planFiltre} style="margin:.6rem 0 1rem">
  <option value="">Tous les plans</option>
  {#each Object.entries(PLANS) as [k, l]}<option value={k}>{l}</option>{/each}
</select>

{#each liste as e (e.id)}
  {@const et = etatAbonnement(e)}
  <div class="card">
    <div class="row"><strong>{e.nom}</strong><span class="badge">{PLANS[e.plan_effectif] ?? e.plan_effectif}</span></div>
    <div class="mut">{[e.email, e.phone, e.pays].filter(Boolean).join(' · ')}</div>
    <div class={et.gravite === 'alerte' ? 'err' : et.gravite === 'attention' ? 'deb' : 'mut'} style="margin:.3rem 0">{et.libelle}</div>
    <div class="mut">{e.commerciaux_actifs} commercial(aux) · {e.equipe} membre(s) · {e.clotures_mois} clôture(s) ce mois ·
      dernière activité : {e.derniere_activite ? dateCourte(e.derniere_activite) : '—'} · inscrite le {dateCourte(e.cree_le)}</div>
    <div class="actions"><button class="btn small" onclick={() => ouvrir(e)}>{ouverte === e.id ? 'Fermer' : 'Modifier le plan'}</button></div>
    {#if ouverte === e.id}
      <div style="margin-top:.8rem">
        <label>Nouveau plan
          <select bind:value={plan}>{#each Object.entries(PLANS) as [k, l]}<option value={k}>{l}</option>{/each}</select>
        </label>
        {#if plan !== 'free'}
          <label>Durée
            <select bind:value={jours}>
              <option value={30}>30 jours</option><option value={90}>90 jours</option>
              <option value={180}>180 jours</option><option value={365}>1 an</option>
            </select>
          </label>
        {/if}
        {#if err}<p class="err">{err}</p>{/if}
        <button class="btn primary" disabled={busy} onclick={() => appliquer(e)}>{busy ? 'Enregistrement…' : 'Appliquer'}</button>
      </div>
    {/if}
  </div>
{:else}
  <p class="mut">Aucune entreprise ne correspond.</p>
{/each}

{#if data.paiements.length}
  <h2>Derniers paiements en ligne</h2>
  {#each data.paiements as p (p.id)}
    <div class="card row">
      <div><strong>{p.entreprise}</strong><div class="mut">{PLANS[p.plan] ?? p.plan} · {p.periode} · {dateCourte(p.cree_le)} · {p.statut}</div></div>
      <strong>{fmt(Number(p.montant), 'CFA')}</strong>
    </div>
  {/each}
{/if}
