// CSV compatible Excel français : séparateur « ; » + BOM UTF-8
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    // Injection de formule : Excel exécute une cellule TEXTE qui commence par = + - @ (ex. un nom de commercial piégé).
    // On la préfixe d'une apostrophe ; les nombres (même négatifs) ne sont pas touchés.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

export function telecharger(nom: string, contenu: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = nom; a.click();
  URL.revokeObjectURL(url);
}
