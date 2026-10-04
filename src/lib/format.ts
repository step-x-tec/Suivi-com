export const libelleDevise = (d: string) => (d === 'CFA' || d === 'XOF' || d === 'XAF' ? 'FCFA' : d);

export function fmt(n: number, devise = 'CFA'): string {
  const dec = ['CFA', 'XOF', 'XAF'].includes(devise) ? 0 : 2;
  return (
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n) +
    ' ' + libelleDevise(devise)
  );
}

export const dateCourte = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
