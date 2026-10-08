import { describe, expect, it } from 'vitest';
import { colonne, creerXlsx, creerZip, crc32, nomFeuille } from '../src/lib/xlsx';

describe('export Excel', () => {
  it('CRC-32 conforme à la valeur de référence', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('lettres de colonnes', () => {
    expect([0, 25, 26, 701, 702].map(colonne)).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA']);
  });
  it('noms de feuilles valides pour Excel (caractères interdits, 31 max, pas de doublon)', () => {
    const deja = new Set<string>();
    expect(nomFeuille('Ventes/Commissions: [x]', deja)).toBe('Ventes Commissions   x');
    expect(nomFeuille('Ventes/Commissions: [x]', deja)).toBe('Ventes Commissions   x (2)');
    expect(nomFeuille('A'.repeat(50), new Set())).toHaveLength(31);
    expect(nomFeuille('   ', new Set())).toBe('Feuille');
  });
  it('archive ZIP bien formée : signatures, nombre d\'entrées, contenu', () => {
    const z = creerZip([{ nom: 'a.txt', contenu: new TextEncoder().encode('bonjour') }, { nom: 'b/c.xml', contenu: new Uint8Array([1, 2, 3]) }]);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(2);
    expect(new TextDecoder().decode(z)).toContain('bonjour');
  });
  it('classeur : 3 feuilles, texte échappé, caractères de contrôle retirés', () => {
    const x = creerXlsx([
      { nom: 'Résumé', lignes: [['Groupe', 'Ventes'], ['A & B <1>', 1500.5], ['ctrl\u0001', 3]] },
      { nom: 'Vide', lignes: [['x']] }
    ]);
    const texte = new TextDecoder().decode(x);
    expect(texte).toContain('A &amp; B &lt;1&gt;');
    expect(texte).toContain('<v>1500.5</v>');
    expect(texte).not.toContain('ctrl\u0001'); // le caractère de contrôle est retiré du texte de la cellule
    expect(texte).toContain('>ctrl</t>');
    expect(texte).toContain('xl/worksheets/sheet2.xml');
    expect(() => creerXlsx([])).toThrow();
  });
});
