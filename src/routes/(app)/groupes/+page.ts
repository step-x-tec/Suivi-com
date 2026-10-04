import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const { data, error } = await supabase.from('groupes').select('*, commerciaux(count)').order('nom');
  if (error) throw error;
  return { groupes: data ?? [] };
};
