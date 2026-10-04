<script lang="ts">
  import { fmt, dateCourte } from '$lib/format';
  let { data } = $props();
  const devise = $derived(data.profil.tenants.devise);
  const solde = $derived(Number(data.solde?.solde ?? 0));
</script>

<h1>Bonjour {data.commercial?.nom ?? data.profil.nom ?? ''}</h1>

<div class="card">
  <div class="row">
    <span>{solde > 0 ? 'À remettre' : solde < 0 ? 'À recevoir' : 'Compte'}</span>
    <span class="net">{solde === 0 ? 'Soldé' : fmt(Math.abs(solde), devise)}</span>
  </div>
  <a class="btn small" style="margin-top:.6rem;display:inline-block"
     href={`/credit/${data.profil.commercial_id}/releve`}>⎙ Mon relevé de compte</a>
</div>

<h2>Mes articles</h2>
{#each data.attributions as a (a.id)}
  {@const vendus = a.qty_initial - a.qty_rest}
  <div class="card">
    <div class="row"><strong>{a.nom}</strong><span class="badge">{a.qty_rest} en stock</span></div>
    <div class="bar"><i style={`width:${a.qty_initial ? Math.round((vendus / a.qty_initial) * 100) : 0}%`}></i></div>
    <div class="mut">{fmt(Number(a.prix), devise)} l'unité · commission {Number(a.pct)} % · {vendus} écoulé(s) sur {a.qty_initial}</div>
  </div>
{:else}
  <p class="mut">Aucun article attribué pour le moment.</p>
{/each}

<h2>Mes reçus</h2>
{#each data.clotures as k (k.id)}
  <a class="card row" href={`/recu/${k.id}`}>
    <div><strong>{k.reference}</strong><div class="mut">{dateCourte(k.created_at)}</div></div>
    <strong>{fmt(Number(k.net_final), devise)}</strong>
  </a>
{:else}
  <p class="mut">Aucun reçu pour le moment.</p>
{/each}
