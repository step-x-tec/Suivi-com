// Miroir TypeScript de public.creer_cloture (supabase/migrations/007) = règles du prototype CommPro v1.
// Sert uniquement à l'aperçu en direct : le serveur reste l'autorité.
//   vendus = restants avant − restants saisis (méthode « rest ») | vendus saisis (méthode « vend »)
//   les défauts sont INCLUS dans les vendus : vendus valides = vendus − défauts
//   brut = vendus × prix ; commission et dû ne portent que sur les vendus valides
//   défauts déduits = défauts × prix ; net = brut − commissions − défauts − divers
//   stock après = restants + défauts (les articles défectueux reviennent dans le stock)
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
  vend: number;          // vendus, défauts compris
  vendValides: number;
  rest: number;          // stock après clôture (défauts remis en stock)
  brutLigne: number;
  montant: number;       // vendus valides × prix
  commission: number;
  du: number;
  defautsValeur: number;
}

export interface ClotureCalc {
  lines: LineResult[];
  brut: number;
  commissions: number;
  defauts: number;
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
  const vide = { vend: 0, vendValides: 0, rest: l.qtyAvant, brutLigne: 0, montant: 0, commission: 0, du: 0, defautsValeur: 0 };
  if (l.saisie === null) return { id: l.id, ok: false, erreur: 'Non saisi', ...vide };

  const vend = method === 'rest' ? l.qtyAvant - l.saisie : l.saisie;
  const restant = l.qtyAvant - vend;
  if (vend < 0 || restant < 0) {
    return { id: l.id, ok: false, erreur: `Quantités incohérentes (stock : ${l.qtyAvant})`, ...vide };
  }
  if (l.defauts > vend) {
    return { id: l.id, ok: false, erreur: `Défauts supérieurs aux ventes (${l.defauts} pour ${vend} vendu(s))`, ...vide };
  }
  const vendValides = vend - l.defauts;
  const brutLigne = arrondi(vend * l.prix, dec);
  const montant = arrondi(vendValides * l.prix, dec);
  const commission = arrondi((montant * l.pct) / 100, dec);
  return {
    id: l.id, ok: true, vend, vendValides, rest: restant + l.defauts,
    brutLigne, montant, commission, du: montant - commission,
    defautsValeur: arrondi(brutLigne - montant, dec)
  };
}

export function calcCloture(
  lines: LineInput[], method: Method, divers: number[], devise: string
): ClotureCalc {
  const dec = decimalesDevise(devise);
  const res = lines.filter((l) => l.saisie !== null).map((l) => calcLigne(l, method, dec));
  const sum = (f: (r: LineResult) => number) => arrondi(res.reduce((s, r) => s + f(r), 0), dec);
  const brut = sum((r) => r.brutLigne);
  const commissions = sum((r) => r.commission);
  const defauts = sum((r) => r.defautsValeur);
  const diversTotal = arrondi(divers.reduce((s, d) => s + arrondi(d, dec), 0), dec);
  return {
    lines: res, brut, commissions, defauts, divers: diversTotal,
    net: arrondi(brut - commissions - defauts - diversTotal, dec),
    valid: res.length > 0 && res.every((r) => r.ok)
  };
}
