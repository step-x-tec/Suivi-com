// Export Excel (.xlsx) sans dépendance : un classeur est une archive ZIP de fichiers XML.
// On écrit l'archive « sans compression » (méthode 0), ce qui suffit pour des tableaux et reste lisible par
// Excel, LibreOffice et Google Sheets. Textes en « inlineStr », en-têtes en gras, nombres au format #,##0.
export type Cellule = string | number | null | undefined;
export interface Feuille { nom: string; lignes: Cellule[][]; largeurs?: number[] }

const enc = new TextEncoder();

// ---------- ZIP (stockage sans compression) ----------
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function creerZip(fichiers: { nom: string; contenu: Uint8Array }[]): Uint8Array {
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1, DOS_TIME = 0; // 01/01/2026 00:00 (valeur fixe, archive reproductible)
  const morceaux: Uint8Array[] = [], centrale: Uint8Array[] = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = enc.encode(f.nom), crc = crc32(f.contenu), taille = f.contenu.length;
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); // 0x0800 : noms en UTF-8
    loc.setUint16(8, 0, true); loc.setUint16(10, DOS_TIME, true); loc.setUint16(12, DOS_DATE, true);
    loc.setUint32(14, crc, true); loc.setUint32(18, taille, true); loc.setUint32(22, taille, true);
    loc.setUint16(26, nom.length, true); loc.setUint16(28, 0, true);
    morceaux.push(new Uint8Array(loc.buffer), nom, f.contenu);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true); cen.setUint16(12, DOS_TIME, true); cen.setUint16(14, DOS_DATE, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, taille, true); cen.setUint32(24, taille, true);
    cen.setUint16(28, nom.length, true); cen.setUint32(42, decalage, true);
    centrale.push(new Uint8Array(cen.buffer), nom);
    decalage += 30 + nom.length + taille;
  }
  const tailleCentrale = centrale.reduce((t, x) => t + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentrale, true); fin.setUint32(16, decalage, true);
  const tout = [...morceaux, ...centrale, new Uint8Array(fin.buffer)];
  const sortie = new Uint8Array(tout.reduce((t, x) => t + x.length, 0));
  let pos = 0;
  for (const x of tout) { sortie.set(x, pos); pos += x.length; }
  return sortie;
}

// ---------- XML du classeur ----------
const echapper = (s: string) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
   .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function colonne(i: number): string { // 0 -> A, 25 -> Z, 26 -> AA
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Excel interdit []:*?/\ dans un nom de feuille, limite à 31 caractères et refuse deux noms identiques
export function nomFeuille(nom: string, deja: Set<string>): string {
  let base = nom.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Feuille';
  let n = base, i = 2;
  while (deja.has(n.toLowerCase())) { const suffixe = ` (${i++})`; n = base.slice(0, 31 - suffixe.length) + suffixe; }
  deja.add(n.toLowerCase());
  return n;
}

function xmlFeuille(f: Feuille): string {
  const lignes = f.lignes.map((l, r) => {
    const cellules = l.map((v, c) => {
      if (v === null || v === undefined || v === '') return '';
      const ref = `${colonne(c)}${r + 1}`;
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) return '';
        return `<c r="${ref}" s="${Number.isInteger(v) ? 2 : 3}"><v>${v}</v></c>`;
      }
      return `<c r="${ref}"${r === 0 ? ' s="1"' : ''} t="inlineStr"><is><t xml:space="preserve">${echapper(String(v))}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cellules}</row>`;
  }).join('');
  const nbCol = Math.max(1, ...f.lignes.map((l) => l.length));
  const largeur = (c: number) => f.largeurs?.[c] ?? Math.min(40, Math.max(10, ...f.lignes.slice(0, 200).map((l) => String(l[c] ?? '').length + 2)));
  const cols = Array.from({ length: nbCol }, (_, c) => `<col min="${c + 1}" max="${c + 1}" width="${largeur(c)}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${lignes}</sheetData></worksheet>`;
}

export function creerXlsx(feuilles: Feuille[]): Uint8Array {
  if (feuilles.length === 0) throw new Error('Au moins une feuille est nécessaire');
  const noms = new Set<string>();
  const nomsFeuilles = feuilles.map((f) => nomFeuille(f.nom, noms));
  const entete = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  const fichiers: { nom: string; contenu: string }[] = [
    { nom: '[Content_Types].xml', contenu: `${entete}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + `</Types>` },
    { nom: '_rels/.rels', contenu: `${entete}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nom: 'xl/workbook.xml', contenu: `${entete}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
      nomsFeuilles.map((n, i) => `<sheet name="${echapper(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + `</sheets></workbook>` },
    { nom: 'xl/_rels/workbook.xml.rels', contenu: `${entete}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    // 0 normal · 1 en-tête gras · 2 entier « #,##0 » · 3 décimal « #,##0.00 »
    { nom: 'xl/styles.xml', contenu: `${entete}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
      `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
      `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ...feuilles.map((f, i) => ({ nom: `xl/worksheets/sheet${i + 1}.xml`, contenu: xmlFeuille(f) }))
  ];
  return creerZip(fichiers.map((f) => ({ nom: f.nom, contenu: enc.encode(f.contenu) })));
}

// Téléchargement depuis le navigateur
export function telechargerXlsx(nomFichier: string, feuilles: Feuille[]) {
  const octets = creerXlsx(feuilles);
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier.endsWith('.xlsx') ? nomFichier : `${nomFichier}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}
