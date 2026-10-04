import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const [s, c, r] = await Promise.all([
    supabase.from('solde_commercial').select('*'),
    supabase.from('commerciaux').select('id, nom, code, status').order('nom'),
    supabase.from('reglements').select('type, montant')
  ]);
  const commerciaux = new Map((c.data ?? []).map((x) => [x.id as string, x]));
  const lignes = (s.data ?? [])
    .map((x) => ({ ...x, commercial: commerciaux.get(x.commercial_id as string) }))
    .filter((x) => x.commercial && (x.commercial.status === 'actif' || Number(x.solde) !== 0))
    .sort((a, b) => Math.abs(Number(b.solde)) - Math.abs(Number(a.solde)));
  const encaisse = (r.data ?? [])
    .filter((x) => x.type === 'remise' || x.type === 'avance')
    .reduce((t, x) => t + Number(x.montant), 0);
  return { lignes, encaisse };
};
