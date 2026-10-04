import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const { data, error } = await supabase
    .from('commerciaux')
    .select('id, nom, code, zone, attributions(count)')
    .eq('status', 'actif')
    .order('nom');
  if (error) throw error;
  return { commerciaux: data ?? [] };
};
