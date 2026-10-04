<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { toCsv, telecharger } from '$lib/csv';
  import {
    CHAMPS, decoderTexte, detecterSeparateur, devinerMapping, lireLignes, modele, parserCsv, valider,
    type TypeImport
  } from '$lib/import-csv';
  let { data } = $props();

  const canEdit = $derived(['admin', 'manager'].includes(data.profil.role));
  const TYPES: [TypeImport, string][] = [['commerciaux', 'Commerciaux'], ['articles', 'Articles'], ['groupes', 'Groupes']];
  const demande = page.url.searchParams.get('type');

  let type = $state<TypeImport>(TYPES.some(([k]) => k === demande) ? (demande as TypeImport) : 'commerciaux');
  let lignes = $state<string[][]>([]);
  let nomFichier = $state('');
  let separateur = $state(';');
  let mapping = $state<Record<string, number>>({});
  let pctDefaut = $state<number | null | undefined>(10);
  let mode = $state<'ignorer' | 'mettre_a_jour'>('ignorer');
  let creerGroupes = $state(true);
  let busy = $state(false), err = $state('');
  let bilan = $state<{ crees: number; maj: number; ignores: number; erreurs: number } | null>(null);

  const champs = $derived(CHAMPS[type]);
  const TAILLE_LOT = 200, MAX_LIGNES = 5000;

  function changerType(t: TypeImport) {
    type = t; bilan = null; err = '';
    mapping = lignes.length ? devinerMapping(lignes[0], CHAMPS[t]) : {};
  }

  async function lireFichier(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    err = ''; bilan = null;
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { err = 'Format Excel non pris en charge. Dans Excel : Fichier > Enregistrer sous > CSV (séparateur : point-virgule).'; return; }
    if (f.size > 5_000_000) { err = 'Fichier trop volumineux (5 Mo maximum).'; return; }
    const texte = decoderTexte(await f.arrayBuffer());
    separateur = detecterSeparateur(texte);
    const lues = parserCsv(texte, separateur);
    if (lues.length < 2) { err = 'Le fichier doit contenir une ligne d\'en-têtes puis au moins une ligne de données.'; return; }
    if (lues.length - 1 > MAX_LIGNES) { err = `Trop de lignes (${lues.length - 1}). Importez ${MAX_LIGNES} lignes maximum à la fois.`; return; }
    lignes = lues; nomFichier = f.name;
    mapping = devinerMapping(lues[0], CHAMPS[type]);
  }

  const modeleCsv = () => telecharger(`modele-${type}.csv`, toCsv(modele(type)));

  // --- Contrôle du contenu ---
  const entetes = $derived(lignes[0] ?? []);
  const manquants = $derived(champs.filter((c) => c.requis && (mapping[c.cle] ?? -1) < 0));
  const verif = $derived(
    lignes.length > 1 && manquants.length === 0
      ? valider(type, lireLignes(lignes, mapping, champs))
      : { valides: [] as any[], erreurs: [] as { ligne: number; message: string }[] });

  const existants = $derived.by(() => {
    const m = new Map<string, string>(); // clé en minuscules -> id
    if (type === 'groupes') for (const g of data.groupes) m.set(g.nom.trim().toLowerCase(), g.id);
    else for (const x of data[type]) m.set(String(x.code).trim().toLowerCase(), x.id);
    return m;
  });
  const cle = (v: any) => (type === 'groupes' ? v.nom : v.code)?.trim().toLowerCase() as string | undefined;
  const aMettreAJour = $derived(verif.valides.filter((v) => { const k = cle(v); return k && existants.has(k); }));
  const aCreer = $derived(verif.valides.filter((v) => { const k = cle(v); return !(k && existants.has(k)); }));
  const sansCode = $derived(type === 'groupes' ? 0 : aCreer.filter((v) => !v.code).length);

  const groupesConnus = $derived(new Set(data.groupes.map((g) => g.nom.trim().toLowerCase())));
  const groupesManquants = $derived(
    type !== 'commerciaux' ? [] :
    [...new Map(verif.valides.filter((v) => v.groupe && !groupesConnus.has(v.groupe.toLowerCase())).map((v) => [v.groupe.toLowerCase(), v.groupe as string])).values()]);

  // Limite du plan : les nouveaux commerciaux actifs doivent tenir dans le quota restant
  const quotaRestant = $derived(
    type === 'commerciaux' && data.quota?.limites.commerciaux != null
      ? data.quota.limites.commerciaux - data.quota.usage.commerciaux : Infinity);
  const nouveauxActifs = $derived(type === 'commerciaux' ? aCreer.filter((v) => v.status !== 'inactif').length : 0);
  const depasseQuota = $derived(nouveauxActifs > quotaRestant);
  const aImporter = $derived(aCreer.length + (mode === 'mettre_a_jour' ? aMettreAJour.length : 0));

  // Création : valeurs par défaut pour les cellules vides. Mise à jour : une cellule vide ne modifie rien.
  function versBase(v: any, idGroupes: Map<string, string>, creation: boolean) {
    const pct = Number(pctDefaut) || 0;
    const base: Record<string, unknown> =
      type === 'groupes' ? { nom: v.nom, business: v.business, zone: v.zone, description: v.description, color: v.color }
      : type === 'articles' ? { code: v.code, nom: v.nom, type: v.type, prix: v.prix, pct_commission: v.pct_commission,
          stock_ref: v.stock_ref, status: v.status, description: v.description }
      : { code: v.code, nom: v.nom, telephone: v.telephone, email: v.email, zone: v.zone, adresse: v.adresse,
          groupe_id: v.groupe ? idGroupes.get(v.groupe.toLowerCase()) ?? null : null,
          pct_default: v.pct_default, status: v.status, notes: v.notes };
    if (creation) {
      const defauts: Record<string, unknown> =
        type === 'groupes' ? { color: '#f5a524' }
        : type === 'articles' ? { type: 'ticket', pct_commission: pct, stock_ref: 0, status: 'actif' }
        : { pct_default: pct, status: 'actif' };
      for (const [k, d] of Object.entries(defauts)) if (base[k] === null || base[k] === undefined) base[k] = d;
      return { tenant_id: data.profil.tenant_id, ...base };
    }
    delete base.code; // la clé d'identification ne change pas
    return Object.fromEntries(Object.entries(base).filter(([, x]) => x !== null && x !== undefined));
  }

  async function importer() {
    if (!navigator.onLine) { err = "L'import nécessite une connexion internet."; return; }
    busy = true; err = ''; bilan = null;
    let crees = 0, maj = 0;
    try {
      const s = data.supabase;
      const idGroupes = new Map<string, string>(data.groupes.map((g) => [g.nom.trim().toLowerCase(), g.id as string]));
      if (type === 'commerciaux' && creerGroupes && groupesManquants.length) {
        const { data: nv, error } = await s.from('groupes')
          .insert(groupesManquants.map((nom) => ({ tenant_id: data.profil.tenant_id, nom }))).select('id, nom');
        if (error) throw error;
        for (const g of nv ?? []) idGroupes.set(g.nom.trim().toLowerCase(), g.id);
      }
      for (let i = 0; i < aCreer.length; i += TAILLE_LOT) {
        const lot = aCreer.slice(i, i + TAILLE_LOT).map((v) => versBase(v, idGroupes, true));
        const { error } = await s.from(type).insert(lot);
        if (error) throw error;
        crees += lot.length;
      }
      if (mode === 'mettre_a_jour') {
        for (let i = 0; i < aMettreAJour.length; i += 10) {
          const rep = await Promise.all(aMettreAJour.slice(i, i + 10).map((v) =>
            s.from(type).update(versBase(v, idGroupes, false)).eq('id', existants.get(cle(v)!)!)));
          const e = rep.find((r) => r.error)?.error;
          if (e) throw e;
          maj += Math.min(10, aMettreAJour.length - i);
        }
      }
      bilan = { crees, maj, ignores: mode === 'ignorer' ? aMettreAJour.length : 0, erreurs: verif.erreurs.length };
      lignes = []; nomFichier = '';
      await invalidateAll();
    } catch (e: any) {
      err = `${e?.message ?? 'Erreur inconnue'}${crees || maj ? ` — ${crees} créé(s) et ${maj} mis à jour avant l'erreur. Relancez avec « ignorer les doublons » pour terminer sans rien dupliquer.` : ''}`;
    }
    busy = false;
  }
</script>

<h1>Importer des données</h1>

{#if data.profil.role === 'admin'}
  <a class="card row" href="/import/v1"><span>📦 Vous venez du prototype CommPro v1 ? Importer votre sauvegarde JSON</span><span class="mut">›</span></a>
{/if}

{#if !canEdit}
  <p class="err">L'import est réservé aux administrateurs et managers.</p>
{:else}
  <div class="seg" style="grid-template-columns:repeat(3,1fr)">
    {#each TYPES as [k, l]}<button class:on={type === k} onclick={() => changerType(k)}>{l}</button>{/each}
  </div>

  <div class="card">
    <p class="mut" style="margin-top:0">
      Fichier <strong>CSV</strong> (Excel : Fichier > Enregistrer sous > CSV). Première ligne = en-têtes. Les colonnes sont reconnues automatiquement.
    </p>
    <button class="btn small" onclick={modeleCsv}>⬇ Télécharger le modèle {type}</button>
    <label style="margin-top:.8rem">Choisir le fichier
      <input type="file" accept=".csv,.txt,text/csv,text/plain" onchange={lireFichier} />
    </label>
    {#if err}<p class="err">{err}</p>{/if}
  </div>

  {#if bilan}
    <div class="card">
      <strong class="ok">✓ Import terminé</strong>
      <p>{bilan.crees} créé(s){bilan.maj ? ` · ${bilan.maj} mis à jour` : ''}{bilan.ignores ? ` · ${bilan.ignores} déjà existant(s) ignoré(s)` : ''}{bilan.erreurs ? ` · ${bilan.erreurs} ligne(s) refusée(s)` : ''}</p>
      <a class="btn small" href={`/${type}`}>Voir les {type}</a>
    </div>
  {/if}

  {#if lignes.length > 1}
    <h2>Colonnes · {nomFichier} · {lignes.length - 1} ligne(s)</h2>
    <div class="card">
      {#each champs as c (c.cle)}
        <label>{c.libelle}{c.requis ? ' *' : ''}
          <select bind:value={mapping[c.cle]}>
            <option value={-1}>— ignorer —</option>
            {#each entetes as h, i}<option value={i}>{h}</option>{/each}
          </select>
        </label>
      {/each}
      {#if type !== 'groupes'}
        <label>Commission appliquée aux nouvelles lignes sans commission (%)
          <input type="number" min="0" max="100" step="any" bind:value={pctDefaut} />
        </label>
      {/if}
    </div>

    {#if manquants.length}
      <p class="err">Colonne obligatoire à associer : {manquants.map((c) => c.libelle).join(', ')}.</p>
    {:else}
      <h2>Contrôle</h2>
      <div class="card">
        <div class="row"><span>À créer</span><strong>{aCreer.length}</strong></div>
        <div class="row"><span>Déjà existants</span><strong>{aMettreAJour.length}</strong></div>
        <div class="row"><span>Lignes refusées</span><strong class={verif.erreurs.length ? 'deb' : ''}>{verif.erreurs.length}</strong></div>
        {#if aMettreAJour.length}
          <div class="seg" style="margin:.8rem 0 0">
            <button class:on={mode === 'ignorer'} onclick={() => (mode = 'ignorer')}>Ignorer les existants</button>
            <button class:on={mode === 'mettre_a_jour'} onclick={() => (mode = 'mettre_a_jour')}>Mettre à jour</button>
          </div>
        {/if}
        {#if groupesManquants.length}
          <label style="display:flex;align-items:center;gap:.6rem;margin-top:.8rem;color:var(--txt)">
            <input type="checkbox" bind:checked={creerGroupes} style="width:auto;min-height:0;margin:0" />
            Créer les {groupesManquants.length} groupe(s) absents : {groupesManquants.slice(0, 4).join(', ')}{groupesManquants.length > 4 ? '…' : ''}
          </label>
          {#if !creerGroupes}<p class="mut">Sans cette option, ces commerciaux seront importés sans groupe.</p>{/if}
        {/if}
        {#if sansCode}<p class="mut">{sansCode} ligne(s) sans code : une relance de l'import les créerait une seconde fois.</p>{/if}
      </div>

      {#if depasseQuota}
        <p class="err">Votre plan permet encore {Math.max(0, quotaRestant)} commercial(aux) actif(s), le fichier en ajoute {nouveauxActifs}. Retirez des lignes, passez à un plan supérieur ou marquez-les « inactif ».</p>
      {/if}

      {#if verif.erreurs.length}
        <div class="card">
          <strong>Lignes refusées (non importées)</strong>
          {#each verif.erreurs.slice(0, 15) as e}<div class="mut">Ligne {e.ligne} : {e.message}</div>{/each}
          {#if verif.erreurs.length > 15}<div class="mut">… et {verif.erreurs.length - 15} autre(s).</div>{/if}
        </div>
      {/if}

      {#if verif.valides.length}
        <div class="card scroll-x">
          <strong>Aperçu</strong>
          <table>
            <thead><tr>{#each champs.slice(0, 4) as c}<th>{c.libelle}</th>{/each}</tr></thead>
            <tbody>
              {#each verif.valides.slice(0, 5) as v}
                <tr>{#each champs.slice(0, 4) as c}<td>{v[c.cle] ?? ''}</td>{/each}</tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <button class="btn primary" disabled={busy || aImporter === 0 || depasseQuota} onclick={importer}>
        {busy ? 'Import en cours…' : `Importer ${aImporter} ligne(s)`}
      </button>
    {/if}
  {/if}
{/if}
