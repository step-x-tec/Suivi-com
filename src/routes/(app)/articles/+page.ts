import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const { data, error } = await supabase.from('articles').select('*').order('nom');
  if (error) throw error;
  return { articles: data ?? [] };
};
