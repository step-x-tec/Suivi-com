import { toutCharger } from '$lib/pagination';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const [c, g, s, attributions] = await Promise.all([
    supabase.from('commerciaux').select('*, groupes(nom)').order('nom'),
    supabase.from('groupes').select('id, nom').eq('archived', false).order('nom'),
    supabase.from('solde_commercial').select('commercial_id, solde, statut'),
    toutCharger((a, b) => supabase.from('attributions').select('id, commercial_id, qty_initial, qty_rest, prix').order('id').range(a, b))
  ]);
  if (c.error) throw c.error;
  const soldes = new Map((s.data ?? []).map((x) => [x.commercial_id as string, x]));
  return { commerciaux: c.data ?? [], groupes: g.data ?? [], soldes, attributions: attributions as any[] };
};
