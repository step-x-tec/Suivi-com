import { describe, expect, it } from 'vitest';
import { CHAMPS, decoderTexte, detecterSeparateur, devinerMapping, lireLignes, nombre, parserCsv, statut, valider } from '../src/lib/import-csv';

describe('lecture CSV', () => {
  it('détecte le séparateur et gère guillemets, retours ligne et BOM', () => {
    expect(detecterSeparateur('nom;tel\na;b')).toBe(';');
    expect(detecterSeparateur('nom,tel\na,b')).toBe(',');
    expect(detecterSeparateur('nom\ttel\na\tb')).toBe('\t');
    expect(parserCsv('nom;note\n"Kofi; Jr";"il dit ""oui"""\n"multi\nligne";x\r\n\r\nAma;y')).toEqual([
      ['nom', 'note'], ['Kofi; Jr', 'il dit "oui"'], ['multi\nligne', 'x'], ['Ama', 'y']]);
  });
  it('décode UTF-8 (avec BOM) et Windows-1252', () => {
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Lomé')]);
    expect(decoderTexte(utf8.buffer)).toBe('Lomé');
    expect(decoderTexte(new Uint8Array([0x4c, 0x6f, 0x6d, 0xe9]).buffer)).toBe('Lomé'); // é = 0xE9 en Windows-1252
  });
});

describe('valeurs', () => {
  it('nombres à la française', () => {
    expect(nombre('1 500')).toBe(1500);
    expect(nombre('1500,50')).toBe(1500.5);
    expect(nombre('10 %')).toBe(10);
    expect(nombre('500 FCFA')).toBe(500);
    expect(nombre('1.500')).toBe(1500);
    expect(nombre('1.500,25')).toBe(1500.25);
    expect(nombre('')).toBeNull();
    expect(nombre('abc')).toBeNaN();
  });
  it('statuts', () => {
    expect(statut('')).toBe('actif');
    expect(statut('Oui')).toBe('actif');
    expect(statut('Désactivé')).toBe('inactif');
    expect(statut('Archivé', true)).toBe('archive');
    expect(statut('Archivé')).toBeNull();
    expect(statut('bof')).toBeNull();
  });
});

describe('repérage des colonnes', () => {
  it('reconnaît accents, majuscules et synonymes', () => {
    const m = devinerMapping(['Nom complet', 'Téléphone', 'E-mail', 'Zone', 'Taux', 'Statut'], CHAMPS.commerciaux);
    expect(m).toMatchObject({ nom: 0, telephone: 1, zone: 3, pct_default: 4, status: 5, code: -1, groupe: -1 });
    expect(m.email).toBe(-1); // « E-mail » → « email » doit être reconnu
  });
});

describe('validation', () => {
  const lire = (csv: string, type: 'commerciaux' | 'articles' | 'groupes') => {
    const rows = parserCsv(csv);
    return lireLignes(rows, devinerMapping(rows[0], CHAMPS[type]), CHAMPS[type]);
  };
  it('commerciaux : valides, erreurs et doublons dans le fichier', () => {
    const r = valider('commerciaux', lire(
      'Nom;Code;Email;Commission;Statut\nKofi;C1;kofi@x.com;12;actif\n;C2;;;\nAma;c1;;;\nEdem;C3;pasunmail;;\nYao;C4;;150;\nSena;;;;inactif', 'commerciaux'));
    expect(r.valides.map((x) => [x.nom, x.code, x.pct_default, x.status])).toEqual([['Kofi', 'C1', 12, 'actif'], ['Sena', null, null, 'inactif']]);
    expect(r.erreurs.map((e) => e.ligne)).toEqual([3, 4, 5, 6]);
    expect(r.erreurs[1].message).toContain('déjà utilisé ligne 2');
  });
  it('articles : prix obligatoire, type et stock contrôlés', () => {
    const r = valider('articles', lire(
      'Article;Prix;Type;Stock\nTicket 1h;500;ticket;1 000\nRecharge;;produit;\nPass;250;bizarre;\nCarte;1 500,50;;12', 'articles'));
    expect(r.valides.map((x) => [x.nom, x.prix, x.type, x.stock_ref, x.pct_commission])).toEqual([
      ['Ticket 1h', 500, 'ticket', 1000, null], ['Carte', 1500.5, null, 12, null]]);
    expect(r.erreurs.map((e) => e.message)).toEqual(['Prix manquant', expect.stringContaining('Type inconnu')]);
  });
  it('groupes : doublons et couleur', () => {
    const r = valider('groupes', lire('Groupe;Couleur\nWiFi;#ff0000\nwifi;\nRecharges;rouge', 'groupes'));
    expect(r.valides).toHaveLength(1);
    expect(r.erreurs).toHaveLength(2);
  });
  it('cellules vides = non renseigné (ne doit pas écraser une fiche existante)', () => {
    const r = valider('commerciaux', lire('Nom;Code;Commission;Statut\nKofi;C1;;', 'commerciaux'));
    expect(r.valides[0]).toMatchObject({ pct_default: null, status: null, telephone: null });
  });
});
