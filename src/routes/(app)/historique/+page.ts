import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const [k, c] = await Promise.all([
    supabase.from('clotures')
      .select('id, reference, commercial_id, brut, defauts, commissions, divers, net_final, status, annulee_motif, created_at, commerciaux(nom)')
      .order('created_at', { ascending: false }).limit(500),
    supabase.from('commerciaux').select('id, nom').order('nom')
  ]);
  if (k.error) throw k.error;
  return { clotures: k.data ?? [], commerciaux: c.data ?? [] };
};
