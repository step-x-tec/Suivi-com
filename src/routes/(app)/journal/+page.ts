import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { supabase } = await parent();
  const { data, error } = await supabase.from('activites')
    .select('id, type, action, meta, created_at, users(nom)')
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return { activites: (data ?? []) as any[] };
};
