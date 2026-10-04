// Conversion d'une sauvegarde du prototype CommPro v1 (fichier « commpro-data-….json », c'est-à-dire l'objet S)
// vers le format attendu par la fonction SQL importer_v1. Pure et testée ; l'écriture se fait côté serveur.
export interface ResumeV1 { groupes: number; articles: number; commerciaux: number; attributions: number; clotures: number; reglements: number }
export interface ResultatV1 { payload: any | null; resume: ResumeV1; avertissements: string[]; deviseV1: string | null; erreur?: string }

const num = (v: unknown, def = 0) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
const entier = (v: unknown, def = 0) => Math.max(0, Math.floor(num(v, def)));
const pourcent = (v: unknown) => Math.min(100, Math.max(0, num(v)));
const txt = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v).trim(); return s === '' ? null : s; };
const vide: ResumeV1 = { groupes: 0, articles: 0, commerciaux: 0, attributions: 0, clotures: 0, reglements: 0 };

// « 04/10/2026 02:25:11 », « 4/10/2026, 02:25 », « 2026-10-04 » → horodatage ISO (heure lue telle quelle, en UTC)
export function dateIso(brut: unknown): string | null {
  const s = txt(brut);
  if (!s) return null;
  let y: number, m: number, d: number, h = 0, mi = 0, se = 0;
  let r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (r) { d = +r[1]; m = +r[2]; y = +r[3]; h = +(r[4] ?? 0); mi = +(r[5] ?? 0); se = +(r[6] ?? 0); }
  else if ((r = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s))) {
    y = +r[1]; m = +r[2]; d = +r[3]; h = +(r[4] ?? 0); mi = +(r[5] ?? 0); se = +(r[6] ?? 0);
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d, h, mi, se));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString() : null;
}

const TYPES_ARTICLE = new Set(['ticket', 'produit', 'service', 'autre']);
const TYPES_REGLEMENT = new Set(['remise', 'avance', 'frais', 'retour', 'ajustement', 'autre']);
const MODES = new Set(['especes', 'mobile', 'virement', 'cheque', 'autre']);

export function normaliserV1(S: any): ResultatV1 {
  const echec = (erreur: string): ResultatV1 => ({ payload: null, resume: { ...vide }, avertissements: [], deviseV1: null, erreur });
  if (!S || typeof S !== 'object') return echec('Fichier illisible.');
  if (S.format === 'commpro-v2') return echec('Ce fichier est une sauvegarde de CommPro v2, pas du prototype v1.');
  if (!Array.isArray(S.commerciaux)) return echec("Fichier non reconnu : ce n'est pas une sauvegarde du prototype CommPro v1.");

  const av: string[] = [];
  const ignore = (n: number, quoi: string) => { if (n > 0) av.push(`${n} ${quoi}`); };
  const maintenant = new Date().toISOString();
  const liste = (x: unknown): any[] => (Array.isArray(x) ? x : []);

  // Groupes
  const groupes: any[] = []; const groupesOk = new Set<string>(); let sansNom = 0;
  for (const g of liste(S.groupes)) {
    const nom = txt(g?.nom);
    if (!nom) { sansNom++; continue; }
    groupes.push({ ref: String(g.id), nom, business: txt(g.business), description: txt(g.desc), color: /^#[0-9a-f]{6}$/i.test(g.color ?? '') ? g.color : null });
    groupesOk.add(String(g.id));
  }
  ignore(sansNom, 'groupe(s) sans nom ignoré(s)');

  // Articles (le code doit être unique : un doublon perd son code, la ligne est conservée)
  const articles: any[] = []; const codesArt = new Set<string>(); let doublonsArt = 0; sansNom = 0;
  for (const a of liste(S.articles)) {
    const nom = txt(a?.nom);
    if (!nom) { sansNom++; continue; }
    let code = txt(a.code);
    if (code && codesArt.has(code.toLowerCase())) { code = null; doublonsArt++; } else if (code) codesArt.add(code.toLowerCase());
    articles.push({ code, nom, type: TYPES_ARTICLE.has(a.type) ? a.type : 'autre', prix: Math.max(0, num(a.prix)),
      pct_commission: pourcent(a.pct), stock_ref: entier(a.stock), status: a.status === 'inactif' ? 'inactif' : 'actif', description: txt(a.desc) });
  }
  ignore(sansNom, 'article(s) sans nom ignoré(s)');
  ignore(doublonsArt, 'article(s) avec un code en double : code retiré, article conservé');

  // Commerciaux
  const commerciaux: any[] = []; const comOk = new Set<string>(); const codesCom = new Set<string>(); let doublonsCom = 0; sansNom = 0;
  for (const c of S.commerciaux) {
    const nom = txt(c?.nom);
    if (!nom) { sansNom++; continue; }
    let code = txt(c.code);
    if (code && codesCom.has(code.toLowerCase())) { code = null; doublonsCom++; } else if (code) codesCom.add(code.toLowerCase());
    commerciaux.push({ ref: String(c.id), code, nom, telephone: txt(c.tel), email: txt(c.email), zone: txt(c.zone), adresse: txt(c.addr),
      groupe_ref: c.groupeId != null && groupesOk.has(String(c.groupeId)) ? String(c.groupeId) : null,
      pct_default: pourcent(c.pct), status: c.status === 'inactif' ? 'inactif' : 'actif', notes: txt(c.notes),
      created_at: dateIso(c.createdAt) });
    comOk.add(String(c.id));
  }
  ignore(sansNom, 'commercial(aux) sans nom ignoré(s)');
  ignore(doublonsCom, 'commercial(aux) avec un code en double : code retiré, fiche conservée');

  // Attributions
  const attributions: any[] = []; let orphelines = 0; sansNom = 0;
  for (const a of liste(S.attributions)) {
    if (!comOk.has(String(a?.commId))) { orphelines++; continue; }
    const nom = txt(a.nom);
    if (!nom) { sansNom++; continue; }
    const qty = entier(a.qty);
    attributions.push({ ref: String(a.id), commercial_ref: String(a.commId), nom, code: txt(a.ref), type: txt(a.type),
      qty_initial: qty, qty_rest: entier(a.qtyRest, qty), prix: Math.max(0, num(a.prix)), pct: pourcent(a.pct), created_at: dateIso(a.createdAt) });
  }
  ignore(orphelines, 'attribution(s) d\'un commercial introuvable ignorée(s)');
  ignore(sansNom, 'attribution(s) sans nom ignorée(s)');

  // Clôtures (historique)
  const clotures: any[] = []; const cloOk = new Set<string>(); let cloOrph = 0, datesIllisibles = 0, plafonnes = 0;
  for (const h of liste(S.historique)) {
    if (!comOk.has(String(h?.commId))) { cloOrph++; continue; }
    let created = dateIso(h.date) ?? dateIso(h.dateStr);
    if (!created) { datesIllisibles++; created = maintenant; }
    const lines = liste(h.lines).map((l) => {
      const prix = Math.max(0, num(l.prix)), pct = pourcent(l.pct);
      const rest = entier(l.rest);
      const vend = entier(l.vend ?? (num(l.vendValides) + num(l.defauts)));
      const defauts = entier(l.defauts);
      const vendValides = entier(l.vendValides, vend - defauts);
      const montant = num(l.mont, vendValides * prix);
      const commission = num(l.comm, (montant * pct) / 100);
      return { attribution_ref: l.aId != null ? String(l.aId) : null, article_nom: txt(l.article) ?? '—', prix, pct,
        qty_avant: rest + vend, vend, vend_valides: vendValides, defauts, rest_apres: rest + defauts,
        montant, commission, du: num(l.du, montant - commission) };
    });
    const divers = liste(h.divers).filter((d) => num(d?.montant) > 0 && txt(d?.label)).map((d) => ({ label: txt(d.label), montant: num(d.montant) }));
    const brut = num(h.tBrut, lines.reduce((t, l) => t + l.vend * l.prix, 0));
    const commissions = num(h.tComm), defauts = num(h.tDef), totalDivers = num(h.totalDivers, divers.reduce((t, d) => t + d.montant, 0));
    const net = num(h.netFinal ?? h.tDu);
    if (Math.abs(brut - commissions - defauts - totalDivers - net) > 1) plafonnes++;
    clotures.push({ ref: String(h.id), commercial_ref: String(h.commId), method: h.method === 'vend' ? 'vend' : 'rest', created_at: created,
      brut, commissions, defauts, divers: totalDivers, net_final: net, lines, divers_lignes: divers });
    cloOk.add(String(h.id));
  }
  ignore(cloOrph, 'clôture(s) d\'un commercial introuvable ignorée(s)');
  ignore(datesIllisibles, 'clôture(s) à la date illisible : date du jour utilisée');
  ignore(plafonnes, 'clôture(s) dont le net ne correspond pas à brut − commissions − défauts − divers (net plafonné à 0 dans le v1) : montant conservé tel quel');

  // Règlements
  const reglements: any[] = []; let regOrph = 0, regNuls = 0;
  for (const r of liste(S.reglements)) {
    if (!comOk.has(String(r?.commId))) { regOrph++; continue; }
    const montant = num(r.montant);
    if (montant <= 0) { regNuls++; continue; }
    const type = TYPES_REGLEMENT.has(r.type) ? r.type : 'autre';
    const created = Number.isFinite(Number(r.dateTs)) && Number(r.dateTs) > 0 ? new Date(Number(r.dateTs)).toISOString() : dateIso(r.date) ?? maintenant;
    reglements.push({ commercial_ref: String(r.commId), cloture_ref: r.cloId != null && cloOk.has(String(r.cloId)) ? String(r.cloId) : null,
      type, sens: type === 'ajustement' ? (r.sens === 'credit' ? 'credit' : 'debit') : null, montant,
      mode: MODES.has(r.mode) ? r.mode : null, reference: txt(r.ref), note: txt(r.note),
      date_reglement: (dateIso(r.date) ?? created).slice(0, 10), created_at: created });
  }
  ignore(regOrph, 'règlement(s) d\'un commercial introuvable ignoré(s)');
  ignore(regNuls, 'règlement(s) de montant nul ignoré(s)');

  const payload = { groupes, articles, commerciaux, attributions, clotures, reglements };
  if (JSON.stringify(payload).length > 4_000_000) return echec('Fichier trop volumineux pour un import en une fois (4 Mo de données maximum).');
  return {
    payload, avertissements: av, deviseV1: txt(S.sym) ?? txt(S.devise),
    resume: { groupes: groupes.length, articles: articles.length, commerciaux: commerciaux.length,
      attributions: attributions.length, clotures: clotures.length, reglements: reglements.length }
  };
}
