// Import de listes (commerciaux, articles, groupes) depuis un fichier CSV : lecture, repérage des colonnes,
// validation ligne par ligne. Fonctions pures, testées ; l'écriture en base est faite par la page.
export type TypeImport = 'commerciaux' | 'articles' | 'groupes';
export interface Champ { cle: string; libelle: string; requis?: boolean; synonymes: string[]; exemple: string }
export interface Erreur { ligne: number; message: string }
export type Valeurs = Record<string, string>;
export interface LigneBrute { ligne: number; v: Valeurs }

export const CHAMPS: Record<TypeImport, Champ[]> = {
  commerciaux: [
    { cle: 'nom', libelle: 'Nom', requis: true, synonymes: ['nomcomplet', 'name', 'commercial', 'nomprenom'], exemple: 'Kofi Mensah' },
    { cle: 'code', libelle: 'Code', synonymes: ['matricule', 'id', 'reference'], exemple: 'C001' },
    { cle: 'telephone', libelle: 'Téléphone', synonymes: ['tel', 'phone', 'mobile', 'portable', 'numero'], exemple: '90123456' },
    { cle: 'email', libelle: 'Email', synonymes: ['mail', 'courriel'], exemple: 'kofi@exemple.com' },
    { cle: 'zone', libelle: 'Zone', synonymes: ['secteur', 'quartier', 'ville'], exemple: 'Lomé' },
    { cle: 'adresse', libelle: 'Adresse', synonymes: ['address'], exemple: '' },
    { cle: 'groupe', libelle: 'Groupe', synonymes: ['equipe', 'agence', 'group'], exemple: 'Réseau WiFi' },
    { cle: 'pct_default', libelle: 'Commission %', synonymes: ['commission', 'pct', 'taux', 'tauxcommission'], exemple: '10' },
    { cle: 'status', libelle: 'Statut', synonymes: ['statut', 'etat', 'actif'], exemple: 'actif' },
    { cle: 'notes', libelle: 'Notes', synonymes: ['note', 'remarque', 'remarques', 'commentaire'], exemple: '' }
  ],
  articles: [
    { cle: 'nom', libelle: 'Nom', requis: true, synonymes: ['article', 'designation', 'libelle', 'produit', 'name'], exemple: 'Ticket 1 heure' },
    { cle: 'prix', libelle: 'Prix unitaire', requis: true, synonymes: ['prixunitaire', 'pu', 'tarif', 'price', 'montant'], exemple: '500' },
    { cle: 'code', libelle: 'Code', synonymes: ['reference', 'ref', 'sku'], exemple: 'T1H' },
    { cle: 'type', libelle: 'Type', synonymes: ['categorie', 'genre'], exemple: 'ticket' },
    { cle: 'pct_commission', libelle: 'Commission %', synonymes: ['commission', 'pct', 'taux', 'tauxcommission'], exemple: '10' },
    { cle: 'stock_ref', libelle: 'Stock de référence', synonymes: ['stock', 'quantite', 'qte'], exemple: '1000' },
    { cle: 'status', libelle: 'Statut', synonymes: ['statut', 'etat', 'actif'], exemple: 'actif' },
    { cle: 'description', libelle: 'Description', synonymes: ['desc', 'details'], exemple: '' }
  ],
  groupes: [
    { cle: 'nom', libelle: 'Nom', requis: true, synonymes: ['groupe', 'name', 'equipe', 'agence'], exemple: 'Réseau WiFi' },
    { cle: 'business', libelle: 'Secteur', synonymes: ['secteur', 'activite', 'metier'], exemple: 'WiFi' },
    { cle: 'zone', libelle: 'Zone', synonymes: ['ville', 'region'], exemple: 'Lomé' },
    { cle: 'description', libelle: 'Description', synonymes: ['desc', 'details'], exemple: '' },
    { cle: 'color', libelle: 'Couleur', synonymes: ['couleur', 'colour'], exemple: '#f5a524' }
  ]
};

// ---------- Lecture du fichier ----------
export function decoderTexte(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf); // CSV enregistré par Excel en français
  }
}

export function detecterSeparateur(texte: string): string {
  const premiere = texte.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const n = (c: string) => premiere.split(c).length - 1;
  const [pv, vi, tab] = [n(';'), n(','), n('\t')];
  return tab > pv && tab > vi ? '\t' : vi > pv ? ',' : ';';
}

export function parserCsv(texte: string, sep = detecterSeparateur(texte)): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [], champ = '', guillemets = false;
  const finLigne = () => {
    ligne.push(champ); champ = '';
    if (ligne.some((x) => x.trim() !== '')) lignes.push(ligne);
    ligne = [];
  };
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; }
      else champ += c;
    } else if (c === '"' && champ === '') guillemets = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texte[i + 1] === '\n') i++; finLigne(); }
    else champ += c;
  }
  if (champ !== '' || ligne.length) finLigne();
  return lignes;
}

// ---------- Repérage des colonnes ----------
export const normaliserEntete = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Retourne, pour chaque champ, l'indice de la colonne du fichier (-1 = absente)
export function devinerMapping(entetes: string[], champs: Champ[]): Record<string, number> {
  const norm = entetes.map(normaliserEntete);
  const pris = new Set<number>();
  const mapping: Record<string, number> = {};
  for (const c of champs) {
    const cibles = [normaliserEntete(c.cle), normaliserEntete(c.libelle), ...c.synonymes.map(normaliserEntete)];
    const i = norm.findIndex((h, idx) => !pris.has(idx) && cibles.includes(h));
    mapping[c.cle] = i;
    if (i >= 0) pris.add(i);
  }
  return mapping;
}

export function lireLignes(lignes: string[][], mapping: Record<string, number>, champs: Champ[]): LigneBrute[] {
  return lignes.slice(1).map((r, i) => ({
    ligne: i + 2, // numéro de ligne dans le fichier (l'en-tête est la ligne 1)
    v: Object.fromEntries(champs.map((c) => [c.cle, mapping[c.cle] >= 0 ? (r[mapping[c.cle]] ?? '').trim() : '']))
  }));
}

// ---------- Valeurs ----------
// null = vide, NaN = illisible. Accepte « 1 500 », « 1500,50 », « 10 % », « 500 FCFA », « 1.500 ».
export function nombre(brut: string): number | null {
  let s = brut.replace(/[\s\u00a0]/g, '').replace(/%/g, '').replace(/(fcfa|cfa|xof|xaf|f)$/i, '');
  if (s === '') return null;
  const virg = s.lastIndexOf(','), pt = s.lastIndexOf('.');
  if (virg >= 0 && pt >= 0) {
    const dec = virg > pt ? ',' : '.', mil = dec === ',' ? '.' : ',';
    s = s.split(mil).join('').replace(dec, '.');
  } else if (virg >= 0) s = s.split(',').length > 2 ? s.split(',').join('') : s.replace(',', '.');
  else if (pt >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.split('.').join('');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const sansAccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function statut(brut: string, autoriseArchive = false): 'actif' | 'inactif' | 'archive' | null {
  const s = sansAccent(brut);
  if (s === '' || ['actif', 'active', 'oui', 'o', '1', 'true', 'vrai'].includes(s)) return 'actif';
  if (['inactif', 'inactive', 'non', 'n', '0', 'false', 'faux', 'desactive'].includes(s)) return 'inactif';
  if (autoriseArchive && ['archive', 'archivee'].includes(s)) return 'archive';
  return null;
}

const TYPES_ARTICLE: Record<string, string> = {
  ticket: 'ticket', tickets: 'ticket', produit: 'produit', produits: 'produit',
  service: 'service', services: 'service', autre: 'autre', autres: 'autre'
};

const vide = (s: string) => (s.trim() === '' ? null : s.trim());

// ---------- Validation ----------
export interface ResultatValidation<T> { valides: (T & { ligne: number })[]; erreurs: Erreur[] }

// null = cellule vide : à la création on applique les valeurs par défaut, à la mise à jour on ne touche à rien
function pourcentage(brut: string, erreurs: Erreur[], ligne: number): number | null {
  const n = nombre(brut);
  if (n === null) return null;
  if (Number.isNaN(n) || n < 0 || n > 100) { erreurs.push({ ligne, message: `Commission invalide : « ${brut} » (0 à 100)` }); return null; }
  return n;
}

export function validerCommerciaux(lignes: LigneBrute[]) {
  const valides: ResultatValidation<any>['valides'] = [], erreurs: Erreur[] = [];
  const codes = new Map<string, number>();
  for (const { ligne, v } of lignes) {
    const e: Erreur[] = [];
    if (!v.nom) e.push({ ligne, message: 'Nom manquant' });
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) e.push({ ligne, message: `Email invalide : « ${v.email} »` });
    const st = v.status === '' ? null : statut(v.status);
    if (v.status !== '' && !st) e.push({ ligne, message: `Statut inconnu : « ${v.status} » (actif ou inactif)` });
    const pct = pourcentage(v.pct_default, e, ligne);
    const code = vide(v.code);
    if (code) {
      const k = code.toLowerCase();
      if (codes.has(k)) e.push({ ligne, message: `Code « ${code} » déjà utilisé ligne ${codes.get(k)}` });
      else codes.set(k, ligne);
    }
    if (e.length) { erreurs.push(...e); continue; }
    valides.push({ ligne, code, nom: v.nom, telephone: vide(v.telephone), email: vide(v.email), zone: vide(v.zone),
      adresse: vide(v.adresse), groupe: vide(v.groupe), pct_default: pct, status: st, notes: vide(v.notes) });
  }
  return { valides, erreurs } as ResultatValidation<any>;
}

export function validerArticles(lignes: LigneBrute[]) {
  const valides: ResultatValidation<any>['valides'] = [], erreurs: Erreur[] = [];
  const codes = new Map<string, number>();
  for (const { ligne, v } of lignes) {
    const e: Erreur[] = [];
    if (!v.nom) e.push({ ligne, message: 'Nom manquant' });
    const prix = nombre(v.prix);
    if (prix === null) e.push({ ligne, message: 'Prix manquant' });
    else if (Number.isNaN(prix) || prix < 0) e.push({ ligne, message: `Prix invalide : « ${v.prix} »` });
    const type = v.type === '' ? null : TYPES_ARTICLE[sansAccent(v.type)];
    if (v.type !== '' && !type) e.push({ ligne, message: `Type inconnu : « ${v.type} » (ticket, produit, service ou autre)` });
    const st = v.status === '' ? null : statut(v.status, true);
    if (v.status !== '' && !st) e.push({ ligne, message: `Statut inconnu : « ${v.status} » (actif, inactif ou archivé)` });
    const pct = pourcentage(v.pct_commission, e, ligne);
    const stockBrut = nombre(v.stock_ref);
    if (stockBrut !== null && (Number.isNaN(stockBrut) || stockBrut < 0)) e.push({ ligne, message: `Stock invalide : « ${v.stock_ref} »` });
    const code = vide(v.code);
    if (code) {
      const k = code.toLowerCase();
      if (codes.has(k)) e.push({ ligne, message: `Code « ${code} » déjà utilisé ligne ${codes.get(k)}` });
      else codes.set(k, ligne);
    }
    if (e.length) { erreurs.push(...e); continue; }
    valides.push({ ligne, code, nom: v.nom, type, prix: prix!, pct_commission: pct,
      stock_ref: stockBrut === null ? null : Math.floor(stockBrut), status: st, description: vide(v.description) });
  }
  return { valides, erreurs } as ResultatValidation<any>;
}

export function validerGroupes(lignes: LigneBrute[]) {
  const valides: ResultatValidation<any>['valides'] = [], erreurs: Erreur[] = [];
  const noms = new Map<string, number>();
  for (const { ligne, v } of lignes) {
    const e: Erreur[] = [];
    if (!v.nom) e.push({ ligne, message: 'Nom manquant' });
    else {
      const k = v.nom.toLowerCase();
      if (noms.has(k)) e.push({ ligne, message: `Groupe « ${v.nom} » déjà présent ligne ${noms.get(k)}` });
      else noms.set(k, ligne);
    }
    if (v.color && !/^#[0-9a-fA-F]{6}$/.test(v.color)) e.push({ ligne, message: `Couleur invalide : « ${v.color} » (ex. #f5a524)` });
    if (e.length) { erreurs.push(...e); continue; }
    valides.push({ ligne, nom: v.nom, business: vide(v.business), zone: vide(v.zone), description: vide(v.description), color: vide(v.color) });
  }
  return { valides, erreurs } as ResultatValidation<any>;
}

export function valider(type: TypeImport, lignes: LigneBrute[]) {
  return type === 'commerciaux' ? validerCommerciaux(lignes)
    : type === 'articles' ? validerArticles(lignes) : validerGroupes(lignes);
}

// Fichier modèle à télécharger : en-têtes + une ligne d'exemple
export const modele = (type: TypeImport): string[][] => [
  CHAMPS[type].map((c) => c.libelle), CHAMPS[type].map((c) => c.exemple)
];
