<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { telecharger } from '$lib/csv';
  import { appelerMembres } from '$lib/membres';
  import { GRILLE, libelleMax, pctUsage, prixPlan, type Periode } from '$lib/plans';
  import { invoquer } from '$lib/fonctions';
  import { fmt } from '$lib/format';
  let { data } = $props();
  const isAdmin = $derived(data.profil.role === 'admin');

  const t = $derived(data.tenant);
  const init = data.tenant;
  let f = $state({ name: init?.name ?? '', email: init?.email ?? '', phone: init?.phone ?? '', country: init?.country ?? '', devise: init?.devise ?? 'CFA' });
  let busy = $state(false), msg = $state(''), err = $state('');

  const ROLES: Record<string, string> = { admin: 'Admin', manager: 'Manager', comptable: 'Comptable', commercial: 'Commercial' };
  const PLANS: Record<string, string> = { free: 'Gratuit', starter: 'Starter', pro: 'Pro', business: 'Business' };

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    busy = true; msg = ''; err = '';
    const n = (v: string) => v.trim() || null;
    const { error } = await data.supabase.from('tenants')
      .update({ name: f.name.trim(), email: n(f.email), phone: n(f.phone), country: n(f.country), devise: f.devise })
      .eq('id', data.profil.tenant_id);
    busy = false;
    if (error) { err = error.message; return; }
    msg = 'Paramètres enregistrés.';
    await invalidateAll();
  }

  let periode = $state<Periode>('mensuel');
  let payBusy = $state(''), payErr = $state('');
  const STATUTS: Record<string, string> = { en_attente: 'En attente', approuve: 'Payé', refuse: 'Refusé', annule: 'Annulé', anomalie: 'À vérifier' };

  async function payer(plan: string) {
    payBusy = plan; payErr = '';
    const r = await invoquer<{ url: string }>(data.supabase, 'paiement-creer', { plan, periode });
    if (r.erreur || !r.data?.url) { payErr = r.erreur ?? 'Réponse invalide du service de paiement.'; payBusy = ''; return; }
    window.location.href = r.data.url; // page de paiement sécurisée FedaPay
  }

  let inv = $state({ email: '', nom: '', role: 'manager', commercial_id: '' });
  let invBusy = $state(false), invMsg = $state(''), invErr = $state('');

  async function inviter(e: SubmitEvent) {
    e.preventDefault();
    invBusy = true; invMsg = ''; invErr = '';
    const m = await appelerMembres(data.supabase, { ...inv });
    invBusy = false;
    if (m) { invErr = m; return; }
    invMsg = `Invitation envoyée à ${inv.email}.`;
    inv = { email: '', nom: '', role: 'manager', commercial_id: '' };
    await invalidateAll();
  }

  async function retirer(u: any) {
    if (!confirm(`Retirer l'accès de ${u.nom ?? u.email} ? Son compte sera supprimé, l'historique est conservé.`)) return;
    invErr = '';
    const m = await appelerMembres(data.supabase, { action: 'retirer', user_id: u.id });
    if (m) invErr = m;
    await invalidateAll();
  }

  async function exportJson() {
    err = '';
    const s = data.supabase, id = data.profil.tenant_id;
    const [g, a, c, at, k, r] = await Promise.all([
      s.from('groupes').select('*'), s.from('articles').select('*'), s.from('commerciaux').select('*'),
      s.from('attributions').select('*'),
      s.from('clotures').select('*, cloture_lines(*), cloture_divers(*)'), s.from('reglements').select('*')
    ]);
    const echec = [g, a, c, at, k, r].find((x) => x.error);
    if (echec?.error) { err = echec.error.message; return; }
    const sauvegarde = {
      format: 'commpro-v2', exporte_le: new Date().toISOString(), entreprise_id: id,
      groupes: g.data, articles: a.data, commerciaux: c.data, attributions: at.data, clotures: k.data, reglements: r.data
    };
    telecharger(`commpro-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(sauvegarde, null, 2), 'application/json');
  }
</script>

<h1>Paramètres</h1>

<h2>Entreprise</h2>
<form class="card" onsubmit={enregistrer}>
  <label>Nom<input bind:value={f.name} required disabled={!isAdmin} /></label>
  <div class="grid2">
    <label>Email<input type="email" bind:value={f.email} disabled={!isAdmin} /></label>
    <label>Téléphone<input type="tel" bind:value={f.phone} disabled={!isAdmin} /></label>
  </div>
  <div class="grid2">
    <label>Pays<input bind:value={f.country} disabled={!isAdmin} /></label>
    <label>Devise
      <select bind:value={f.devise} disabled={!isAdmin}>
        <option>CFA</option><option>USD</option><option>EUR</option><option>GHS</option>
      </select>
    </label>
  </div>
  {#if f.devise !== t?.devise}
    <p class="mut">Les clôtures et règlements déjà enregistrés gardent leur devise d'origine : ne changez la devise que pour les nouvelles opérations.</p>
  {/if}
  {#if err}<p class="err">{err}</p>{/if}
  {#if msg}<p class="ok">{msg}</p>{/if}
  {#if isAdmin}<button class="btn primary" disabled={busy}>Enregistrer</button>{/if}
</form>

<h2>Plan</h2>
<div class="card">
  <div class="row">
    <span>Plan actuel</span><span class="badge">{PLANS[data.quota?.plan ?? t?.plan ?? 'free']}</span>
  </div>
  {#if data.quota?.renouvellement}<div class="mut">Renouvellement : {data.quota.renouvellement}</div>{/if}
  {#if data.quota}
    {#each [
      { l: 'Commerciaux actifs', u: data.quota.usage.commerciaux, m: data.quota.limites.commerciaux },
      { l: 'Clôtures ce mois', u: data.quota.usage.clotures_mois, m: data.quota.limites.clotures_mois },
      { l: "Membres de l'équipe", u: data.quota.usage.equipe, m: data.quota.limites.equipe }
    ] as r}
      <div style="margin-top:.7rem">
        <div class="row"><span class="mut">{r.l}</span><span>{r.u} / {libelleMax(r.m)}</span></div>
        <div class="bar"><i style={`width:${pctUsage(r.u, r.m)}%;${pctUsage(r.u, r.m) >= 100 ? 'background:var(--bad)' : ''}`}></i></div>
      </div>
    {/each}
  {/if}
</div>
<div class="seg" style="margin-top:.8rem">
  <button class:on={periode === 'mensuel'} onclick={() => (periode = 'mensuel')}>Mensuel</button>
  <button class:on={periode === 'annuel'} onclick={() => (periode = 'annuel')}>Annuel (2 mois offerts)</button>
</div>
{#each GRILLE as g}
  {@const courant = g.id === (data.quota?.plan ?? 'free')}
  <div class="card" style={courant ? 'border-color:var(--acc)' : ''}>
    <div class="row">
      <strong>{g.nom}{courant ? ' · actuel' : ''}</strong>
      <strong>{g.prix ? fmt(prixPlan(g.prix, periode), 'CFA') + (periode === 'annuel' ? ' / an' : ' / mois') : 'Gratuit'}</strong>
    </div>
    <div class="mut">{g.resume}</div>
    {#if isAdmin && g.id !== 'free'}
      <button class="btn small" style="margin-top:.6rem" disabled={payBusy !== ''} onclick={() => payer(g.id)}>
        {payBusy === g.id ? 'Redirection…' : courant ? 'Renouveler' : 'Choisir'} · Mobile Money
      </button>
    {/if}
  </div>
{/each}
{#if payErr}<p class="err">{payErr}</p>{/if}
{#if data.paiements.length}
  <h2>Paiements</h2>
  {#each data.paiements as pa (pa.id)}
    <div class="card row">
      <div>
        <strong>{pa.plan} · {pa.periode}</strong>
        <div class="mut">{new Date(pa.created_at).toLocaleDateString('fr-FR')}{pa.plan_active_jusqu ? ` · actif jusqu'au ${pa.plan_active_jusqu}` : ''}</div>
      </div>
      <div style="text-align:right"><strong>{fmt(Number(pa.montant), 'CFA')}</strong><div class="mut">{STATUTS[pa.statut] ?? pa.statut}</div></div>
    </div>
  {/each}
{/if}

<h2>Utilisateurs</h2>
{#each data.utilisateurs as u (u.id)}
  <div class="card row">
    <div><strong>{u.nom ?? u.email}</strong><div class="mut">{u.email}</div></div>
    <div class="row">
      <span class="badge">{ROLES[u.role] ?? u.role}</span>
      {#if isAdmin && u.id !== data.session?.user.id}
        <button class="btn small" onclick={() => retirer(u)}>Retirer</button>
      {/if}
    </div>
  </div>
{/each}

{#if isAdmin}
  <h2>Inviter un membre</h2>
  <form class="card" onsubmit={inviter}>
    <label>Email<input type="email" bind:value={inv.email} required /></label>
    <label>Nom<input bind:value={inv.nom} /></label>
    <label>Rôle
      <select bind:value={inv.role}>
        <option value="manager">Manager (crée, attribue, clôture)</option>
        <option value="comptable">Comptable (lecture seule)</option>
        <option value="commercial">Commercial (portail personnel)</option>
      </select>
    </label>
    {#if inv.role === 'commercial'}
      <label>Fiche commercial
        <select bind:value={inv.commercial_id} required>
          <option value="">— choisir —</option>
          {#each data.commerciaux as c}<option value={c.id}>{c.nom}</option>{/each}
        </select>
      </label>
    {/if}
    {#if invErr}<p class="err">{invErr}</p>{/if}
    {#if invMsg}<p class="ok">{invMsg}</p>{/if}
    <button class="btn primary" disabled={invBusy}>Envoyer l'invitation</button>
  </form>
{/if}

{#if isAdmin}
  <h2>Données</h2>
  <button class="btn" onclick={exportJson}>Exporter une sauvegarde complète (JSON)</button>
{/if}
