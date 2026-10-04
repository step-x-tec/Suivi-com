// Miroir TypeScript de public.creer_cloture (supabase/migrations/001).
// Sert uniquement à l'aperçu en direct : le serveur reste l'autorité.
export type Method = 'rest' | 'vend';

export interface LineInput {
  id: string;
  qtyAvant: number;
  prix: number;
  pct: number;
  saisie: number | null; // restants (rest) ou vendus (vend)
  defauts: number;
}

export interface LineResult {
  id: string;
  ok: boolean;
  erreur?: string;
  vend: number;
  rest: number;
  montant: number;
  commission: number;
  du: number;
  defautsValeur: number;
}

export interface ClotureCalc {
  lines: LineResult[];
  brut: number;
  commissions: number;
  defauts: number; // valeur informative, non déduite (hypothèse H2)
  divers: number;
  net: number;
  valid: boolean;
}

export const decimalesDevise = (devise: string) =>
  ['CFA', 'XOF', 'XAF'].includes(devise) ? 0 : 2;

export function arrondi(n: number, dec: number): number {
  const f = 10 ** dec;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function calcLigne(l: LineInput, method: Method, dec: number): LineResult {
  const vide = { vend: 0, rest: l.qtyAvant, montant: 0, commission: 0, du: 0, defautsValeur: 0 };
  if (l.saisie === null) return { id: l.id, ok: false, erreur: 'Non saisi', ...vide };

  const vend = method === 'rest' ? l.qtyAvant - l.saisie - l.defauts : l.saisie;
  const rest = method === 'rest' ? l.saisie : l.qtyAvant - l.saisie - l.defauts;
  if (vend < 0 || rest < 0) {
    return { id: l.id, ok: false, erreur: `Quantités incohérentes (stock : ${l.qtyAvant})`, ...vide };
  }
  const montant = arrondi(vend * l.prix, dec);
  const commission = arrondi((montant * l.pct) / 100, dec);
  return {
    id: l.id, ok: true, vend, rest, montant, commission,
    du: montant - commission,
    defautsValeur: arrondi(l.defauts * l.prix, dec)
  };
}

export function calcCloture(
  lines: LineInput[], method: Method, divers: number[], devise: string
): ClotureCalc {
  const dec = decimalesDevise(devise);
  const res = lines.filter((l) => l.saisie !== null).map((l) => calcLigne(l, method, dec));
  const sum = (f: (r: LineResult) => number) => res.reduce((s, r) => s + f(r), 0);
  const brut = sum((r) => r.montant);
  const commissions = sum((r) => r.commission);
  const diversTotal = divers.reduce((s, d) => s + arrondi(d, dec), 0);
  return {
    lines: res, brut, commissions,
    defauts: sum((r) => r.defautsValeur),
    divers: diversTotal,
    net: brut - commissions - diversTotal,
    valid: res.length > 0 && res.every((r) => r.ok)
  };
}
