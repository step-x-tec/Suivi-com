<script lang="ts">
  import { toCsv, telecharger } from '$lib/csv';
  let { data } = $props();

  const TYPES: Record<string, string> = { add: 'Création', edit: 'Modification', del: 'Suppression',
    attr: 'Attribution', cloture: 'Clôture', reglement: 'Règlement', sys: 'Système' };
  let type = $state(''), q = $state('');

  const heure = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const detail = (a: any) => [a.action, a.meta?.nom].filter(Boolean).join(' · ');

  const liste = $derived(
    data.activites.filter((a) =>
      (!type || a.type === type) &&
      `${detail(a)} ${a.users?.nom ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  );

  const exporter = () =>
    telecharger('journal-activite.csv', toCsv([
      ['Date (UTC)', 'Type', 'Utilisateur', 'Action'],
      ...liste.map((a) => [a.created_at, TYPES[a.type] ?? a.type, a.users?.nom ?? '', detail(a)])
    ]));
</script>

<h1>Journal d'activité</h1>
<div class="grid2" style="margin-bottom:.8rem">
  <select bind:value={type}>
    <option value="">Tous les types</option>
    {#each Object.entries(TYPES) as [k, l]}<option value={k}>{l}</option>{/each}
  </select>
  <input placeholder="Rechercher…" bind:value={q} style="margin-top:0" />
</div>
<div class="row" style="margin-bottom:.8rem">
  <span class="mut">{liste.length} événement(s)</span>
  <button class="btn small" onclick={exporter} disabled={liste.length === 0}>Export CSV</button>
</div>

{#each liste as a (a.id)}
  <div class="card">
    <div class="row"><strong>{TYPES[a.type] ?? a.type}</strong><span class="mut">{heure(a.created_at)}</span></div>
    <div>{detail(a)}</div>
    <div class="mut">{a.users?.nom ?? 'Système'}</div>
  </div>
{:else}
  <p class="mut">Aucune activité.</p>
{/each}
