import { describe, expect, it } from 'vitest';
import { dateIso, normaliserV1 } from '../src/lib/import-v1';

// Sauvegarde fabriquée avec les mêmes champs que ceux écrits par le prototype v1
const S = {
  devise: 'CFA', sym: 'FCFA', cfg: { defPct: 15 },
  groupes: [{ id: 1, nom: 'WiFi', business: 'Réseau', desc: 'Lomé', color: '#f5a524' }, { id: 2, nom: '' }],
  articles: [{ id: 1, code: 'ART001', nom: 'Ticket 1h', type: 'ticket', prix: 500, pct: 10, stock: 1000, status: 'actif', desc: '' },
    { id: 2, code: 'art001', nom: 'Ticket 2h', type: 'bizarre', prix: 900, pct: 10, stock: 0, status: 'inactif' }],
  commerciaux: [
    { id: 1, code: 'COM001', nom: 'Kofi', tel: '90', email: '', zone: 'Lomé', groupeId: 1, pct: 15, status: 'actif', addr: '', notes: '', createdAt: '01/10/2026' },
    { id: 2, code: 'COM001', nom: 'Ama', groupeId: 99, pct: 150, status: 'inactif' }, { id: 3, nom: ' ' }],
  attributions: [
    { id: 1, commId: 1, nom: 'Ticket 1h', ref: 'T1', type: 'ticket', qty: 100, qtyRest: 25, prix: 500, pct: 10, createdAt: '02/10/2026' },
    { id: 2, commId: 42, nom: 'Orpheline', qty: 5, qtyRest: 5, prix: 100, pct: 10 }],
  historique: [{
    id: 'h1', commId: 1, date: '03/10/2026 10:30:00', dateStr: '03/10/2026', method: 'rest',
    tBrut: 30000, tComm: 2900, tDu: 26100, tDef: 1000, totalDivers: 1500, netFinal: 24600,
    lines: [{ aId: 1, article: 'Ticket 1h', prix: 500, pct: 10, qtyInit: 100, vend: 60, vendValides: 58, defauts: 2, rest: 40, mont: 29000, comm: 2900, du: 26100 }],
    divers: [{ id: 'd1', label: 'Déplacement', montant: 1500 }, { id: 'd2', label: '', montant: 0 }]
  }, { id: 'h2', commId: 77, date: '03/10/2026', lines: [] }],
  reglements: [
    { id: 'r1', commId: 1, cloId: 'h1', type: 'remise', mode: 'mobile', montant: 10000, ref: 'MM1', note: '', date: '2026-10-04', dateTs: Date.UTC(2026, 9, 4, 8, 0, 0) },
    { id: 'r2', commId: 1, type: 'ajustement', mode: 'ajustement', montant: 500, ref: 'SOLDE-AUTO-04102026', note: 'Solde automatique', date: '04/10/2026' },
    { id: 'r3', commId: 1, type: 'remise', montant: 0 }, { id: 'r4', commId: 5, type: 'avance', montant: 10 }]
};

describe('dates du prototype', () => {
  it('lit les formats français et ISO, refuse le reste', () => {
    expect(dateIso('03/10/2026 10:30:00')).toBe('2026-10-03T10:30:00.000Z');
    expect(dateIso('4/10/2026, 02:25')).toBe('2026-10-04T02:25:00.000Z');
    expect(dateIso('03/10/2026\u202f10:30:00')).toBe('2026-10-03T10:30:00.000Z'); // espace insécable
    expect(dateIso('03/10/2026')).toBe('2026-10-03T00:00:00.000Z');
    expect(dateIso('2026-10-04')).toBe('2026-10-04T00:00:00.000Z');
    expect(dateIso('31/02/2026')).toBeNull();
    expect(dateIso('n’importe quoi')).toBeNull();
    expect(dateIso('')).toBeNull();
  });
});

describe('conversion de la sauvegarde v1', () => {
  const r = normaliserV1(S);
  it('compte ce qui sera importé et ignore ce qui est inutilisable', () => {
    expect(r.erreur).toBeUndefined();
    expect(r.resume).toEqual({ groupes: 1, articles: 2, commerciaux: 2, attributions: 1, clotures: 1, reglements: 2 });
    expect(r.deviseV1).toBe('FCFA');
  });
  it('retire les codes en double sans perdre la fiche, borne les pourcentages et les groupes inconnus', () => {
    expect(r.payload.articles.map((a: any) => a.code)).toEqual(['ART001', null]);
    expect(r.payload.articles[1].type).toBe('autre');
    expect(r.payload.commerciaux.map((c: any) => [c.nom, c.code, c.groupe_ref, c.pct_default, c.status])).toEqual([
      ['Kofi', 'COM001', '1', 15, 'actif'], ['Ama', null, null, 100, 'inactif']]);
  });
  it('reconstitue la clôture : stock avant/après, divers séparés du total, net conservé', () => {
    const k = r.payload.clotures[0];
    expect(k).toMatchObject({ ref: 'h1', commercial_ref: '1', method: 'rest', created_at: '2026-10-03T10:30:00.000Z',
      brut: 30000, commissions: 2900, defauts: 1000, divers: 1500, net_final: 24600 });
    expect(k.divers_lignes).toEqual([{ label: 'Déplacement', montant: 1500 }]);
    expect(k.lines[0]).toMatchObject({ attribution_ref: '1', vend: 60, vend_valides: 58, defauts: 2, qty_avant: 100, rest_apres: 42, montant: 29000, commission: 2900, du: 26100 });
  });
  it('règlements : ajustement sans sens = débit (comme le v1), montants nuls et orphelins ignorés, lien clôture conservé', () => {
    expect(r.payload.reglements[0]).toMatchObject({ type: 'remise', mode: 'mobile', cloture_ref: 'h1', date_reglement: '2026-10-04', created_at: '2026-10-04T08:00:00.000Z' });
    expect(r.payload.reglements[1]).toMatchObject({ type: 'ajustement', sens: 'debit', mode: null, date_reglement: '2026-10-04', cloture_ref: null });
    expect(r.avertissements.join(' | ')).toMatch(/règlement\(s\) de montant nul/);
    expect(r.avertissements.join(' | ')).toMatch(/clôture\(s\) d'un commercial introuvable/);
  });
  it('refuse les fichiers qui ne sont pas une sauvegarde v1', () => {
    expect(normaliserV1(null).erreur).toBeTruthy();
    expect(normaliserV1({ format: 'commpro-v2' }).erreur).toMatch(/v2/);
    expect(normaliserV1({ foo: 1 }).erreur).toMatch(/non reconnu/);
  });
});
