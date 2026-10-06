// Règles de l'API publique, pures et testées (routage, pagination, validation d'une clôture).
export type NomRoute = 'commerciaux' | 'attributions' | 'credit/soldes' | 'rapports/resume' | 'clotures' | 'methode' | 'inconnue';

const ROUTES: Record<string, { methode: string; nom: NomRoute }> = {
  'commerciaux': { methode: 'GET', nom: 'commerciaux' },
  'attributions': { methode: 'GET', nom: 'attributions' },
  'credit/soldes': { methode: 'GET', nom: 'credit/soldes' },
  'rapports/resume': { methode: 'GET', nom: 'rapports/resume' },
  'clotures': { methode: 'POST', nom: 'clotures' }
};

// Accepte « /functions/v1/api-v1/commerciaux » (adresse Supabase) comme « /api/v1/commerciaux » (si redirection)
export function lireRoute(methode: string, chemin: string): NomRoute {
  const m = /\/(?:api-v1|api\/v1)\/(.+?)\/?$/.exec(chemin);
  const r = m ? ROUTES[m[1]] : undefined;
  if (!r) return 'inconnue';
  return r.methode === methode ? r.nom : 'methode';
}

export function lireLimites(p: URLSearchParams): { limit: number; offset: number } {
  const n = (v: string | null, def: number) => { const x = Number(v); return v !== null && v !== '' && Number.isInteger(x) ? x : def; };
  return { limit: Math.min(200, Math.max(1, n(p.get('limit'), 50))), offset: Math.max(0, n(p.get('offset'), 0)) };
}

export const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CloturePayload {
  commercial_id: string; method: 'rest' | 'vend';
  lines: { attribution_id: string; saisie: number; defauts: number }[];
  divers: { label: string; montant: number }[]; note: string | null;
}

export function validerCloture(b: any): { ok: true; valeur: CloturePayload } | { ok: false; erreur: string } {
  const non = (erreur: string) => ({ ok: false as const, erreur });
  if (!b || typeof b !== 'object' || Array.isArray(b)) return non('Corps JSON attendu');
  if (typeof b.commercial_id !== 'string' || !UUID.test(b.commercial_id)) return non('commercial_id invalide');
  if (b.method !== 'rest' && b.method !== 'vend') return non("method doit valoir 'rest' (restants saisis) ou 'vend' (vendus saisis)");
  if (!Array.isArray(b.lines) || b.lines.length === 0) return non('lines : au moins une ligne est requise');
  if (b.lines.length > 200) return non('lines : 200 lignes maximum');

  const lines: CloturePayload['lines'] = [];
  const vus = new Set<string>();
  for (const [i, l] of b.lines.entries()) {
    if (!l || typeof l.attribution_id !== 'string' || !UUID.test(l.attribution_id)) return non(`lines[${i}].attribution_id invalide`);
    if (vus.has(l.attribution_id.toLowerCase())) return non(`lines[${i}] : attribution déjà présente dans la requête`);
    vus.add(l.attribution_id.toLowerCase());
    if (!Number.isInteger(l.saisie) || l.saisie < 0) return non(`lines[${i}].saisie doit être un entier positif ou nul`);
    const defauts = l.defauts ?? 0;
    if (!Number.isInteger(defauts) || defauts < 0) return non(`lines[${i}].defauts doit être un entier positif ou nul`);
    lines.push({ attribution_id: l.attribution_id, saisie: l.saisie, defauts });
  }

  const divers: CloturePayload['divers'] = [];
  if (b.divers !== undefined) {
    if (!Array.isArray(b.divers) || b.divers.length > 50) return non('divers : tableau de 50 éléments maximum');
    for (const [i, d] of b.divers.entries()) {
      const label = typeof d?.label === 'string' ? d.label.trim() : '';
      if (!label || label.length > 100) return non(`divers[${i}].label : texte de 1 à 100 caractères`);
      if (typeof d.montant !== 'number' || !Number.isFinite(d.montant) || d.montant < 0) return non(`divers[${i}].montant doit être un nombre positif ou nul`);
      divers.push({ label, montant: d.montant });
    }
  }
  if (b.note !== undefined && b.note !== null && (typeof b.note !== 'string' || b.note.length > 500)) return non('note : texte de 500 caractères maximum');
  return { ok: true, valeur: { commercial_id: b.commercial_id, method: b.method, lines, divers, note: b.note ?? null } };
}
